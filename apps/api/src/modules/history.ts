import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Injectable,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { carSchema, eventSchema, date, type EventInput } from '@carhistory/validation';
import {
  Actor,
  Db,
  Tx,
  audit,
  changed,
  day,
  fail,
  hash,
  json,
  notFound,
  own,
  page,
  paginated,
  uuid,
  visibleEvents,
} from '../common/core';
import { addMonths, maskVin, mileageConflict, serviceTotal } from '../common/domain';
export const eventInclude = {
  parts: true,
  attachments: { include: { file: true } },
  serviceCenter: true,
} as const;
export function eventDto(e: any, userId: string) {
  return {
    id: e.id,
    relatedEventId: e.relatedEventId,
    carId: e.carId,
    kind: e.kind,
    title: e.title,
    description: e.description,
    date: e.date,
    odometerKm: e.odometerKm,
    laborCost: e.laborCost.toString(),
    extraCost: e.extraCost.toString(),
    totalCost: e.totalCost.toString(),
    currency: e.currency,
    data: e.data,
    version: e.version,
    transferAllowed: e.transferAllowed,
    createdAt: e.createdAt,
    parts: e.parts?.map((p: any) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      article: p.article,
      quantity: p.quantity.toString(),
      unit: p.unit,
      unitPrice: p.unitPrice.toString(),
      position: p.position,
      warrantyUntil: p.warrantyUntil,
      warrantyKm: p.warrantyKm,
    })),
    files: e.attachments
      ?.filter((a: any) => a.file.status === 'ready' && (a.file.userId === userId || a.file.transferAllowed))
      .map((a: any) => ({ id: a.file.id, name: a.file.originalName, mime: a.file.mime, size: a.file.size })),
    serviceCenter: e.serviceCenter ? { id: e.serviceCenter.id, name: e.serviceCenter.name } : null,
  };
}
export function carDto(c: any) {
  return {
    id: c.id,
    brand: c.brand,
    model: c.model,
    year: c.year,
    generation: c.generation,
    vin: maskVin(c.vin),
    licensePlate: c.licensePlate,
    engineType: c.engineType,
    engineVolume: c.engineVolume?.toString(),
    horsepower: c.horsepower,
    transmission: c.transmission,
    drivetrain: c.drivetrain,
    color: c.color,
    note: c.note,
    currency: c.currency,
    demo: c.demo,
    version: c.version,
    archived: !!c.deletedAt,
    latestMileage: c.mileage?.[0]
      ? { id: c.mileage[0].id, odometerKm: c.mileage[0].odometerKm, date: c.mileage[0].date }
      : null,
    photos: c.files?.map((f: any) => ({ id: f.id, position: f.photoPosition })),
    lastEvent: c.events?.[0]
      ? { id: c.events[0].id, title: c.events[0].title, date: c.events[0].date }
      : null,
  };
}
const mileageWhere = { OR: [{ eventId: null }, { event: { deletedAt: null } }] };
@Injectable()
export class HistoryService {
  constructor(@Inject(Db) readonly db: Db) {}
  async mileageCheck(tx: Tx, carId: string, input: EventInput, excludeId?: string) {
    if (input.odometerKm === undefined) return;
    const readings = await tx.mileage.findMany({
      where: { carId, ...mileageWhere, ...(excludeId ? { NOT: { eventId: excludeId } } : {}) },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    const when = day(input.date);
    const prev = readings.filter((r) => r.date <= when).at(-1);
    const next = readings.find((r) => r.date > when);
    const conflict = mileageConflict(
      input.odometerKm,
      input.changeType === 'replacement' ? null : prev?.odometerKm,
      next?.changeType === 'replacement' ? null : next?.odometerKm,
    );
    if (conflict && (!input.confirmed || !input.reason?.trim()))
      fail(
        409,
        'MILEAGE_CONFIRMATION_REQUIRED',
        'Показание расходится с соседними записями. Подтвердите изменение и укажите причину',
      );
  }
  async save(actor: Actor, carId: string, raw: unknown, key?: string, id?: string) {
    const input = eventSchema.parse(raw);
    if (key) z.string().min(8).max(128).parse(key);
    return this.db.$transaction(
      async (tx) => {
        await own(tx, actor, carId, true);
        if (key && !id) {
          const prior = await tx.event.findUnique({
            where: { carId_idempotencyKey: { carId, idempotencyKey: key } },
            include: eventInclude,
          });
          if (prior) {
            if (prior.requestHash !== hash(JSON.stringify(input)))
              fail(409, 'IDEMPOTENCY_CONFLICT', 'Этот ключ уже использован для другой записи');
            return eventDto(prior, actor.id);
          }
        }
        const before = id
          ? await tx.event.findFirst({
              where: { id, carId, deletedAt: null, ...visibleEvents(actor.id) },
              include: eventInclude,
            })
          : null;
        if (id && !before) notFound();
        if (before && (input.version !== before.version || input.kind !== before.kind))
          fail(409, 'RECORD_CONFLICT', 'Запись уже изменена. Обновите данные и повторите');
        await this.mileageCheck(tx, carId, input, id);
        if (
          input.serviceCenterId &&
          !(await tx.serviceCenter.findFirst({ where: { id: input.serviceCenterId, userId: actor.id } }))
        )
          notFound();
        if (input.fileIds.length) {
          const count = await tx.file.count({
            where: {
              id: { in: input.fileIds },
              carId,
              status: 'ready',
              OR: [{ userId: actor.id }, { transferAllowed: true }],
            },
          });
          if (count !== new Set(input.fileIds).size) notFound();
        }
        if(input.relatedEventId){const parent=await tx.event.findFirst({where:{id:input.relatedEventId,carId,deletedAt:null,kind:{in:['accident','maintenance','repair']}}});if(!parent||parent.id===id)notFound();}
      const service = ['maintenance', 'repair'].includes(input.kind);
        const total = service ? serviceTotal(input) : input.kind === 'expense' ? input.amount : '0';
        const data: any = {
          category: input.category,
          amount: input.amount,
          reason: input.reason,
          confirmed: input.confirmed,
          changeType: input.changeType,
        };
        if (input.kind === 'accident')
          Object.assign(data, {
            severity: input.severity,
            zones: input.zones,
            insuranceCase: input.insuranceCase,
            estimatedDamage: input.estimatedDamage,
          });
        if (input.kind === 'document')
          Object.assign(data, { documentType: input.documentType, expiresAt: input.expiresAt });
        if (service) Object.assign(data, { nextKm: input.nextKm, nextMonths: input.nextMonths });
        const values = {
          kind: input.kind,
        relatedEventId: input.relatedEventId??null,
          title: input.title,
          description: input.description,
          date: day(input.date),
          odometerKm: input.odometerKm ?? null,
          currency: input.currency,
          laborCost: service ? input.laborCost : '0',
          extraCost: service ? input.extraCost : '0',
          totalCost: total,
          data: json(data),
          transferAllowed: input.transferAllowed,
          serviceCenterId: input.serviceCenterId ?? null,
        };
        const event = before
          ? await tx.event.update({
              where: { id: before.id },
              data: { ...values, version: { increment: 1 } },
            })
          : await tx.event.create({
              data: {
                ...values,
                carId,
                createdBy: actor.id,
                idempotencyKey: key,
                requestHash: key ? hash(JSON.stringify(input)) : null,
              },
            });
        await tx.part.deleteMany({ where: { eventId: event.id } });
        if (service && input.parts.length)
          await tx.part.createMany({
            data: input.parts.map((p) => ({
              ...p,
              eventId: event.id,
              warrantyUntil: p.warrantyUntil ? day(p.warrantyUntil) : null,
            })),
          });
        await tx.attachment.deleteMany({ where: { eventId: event.id } });
        if (input.fileIds.length)
          await tx.attachment.createMany({
            data: [...new Set(input.fileIds)].map((fileId) => ({ eventId: event.id, fileId, stage:input.fileStages[fileId]??'document' })),
          });
        if (input.odometerKm !== undefined)
          await tx.mileage.upsert({
            where: { eventId: event.id },
            create: {
              carId,
              eventId: event.id,
              date: event.date,
              odometerKm: input.odometerKm,
              source: service ? 'service' : input.kind === 'document' ? 'document' : 'manual',
              reason: input.reason,
              confirmed: input.confirmed,
              changeType: input.changeType,
            },
            update: {
              date: event.date,
              odometerKm: input.odometerKm,
              reason: input.reason ?? null,
              confirmed: input.confirmed,
              changeType: input.changeType,
              version: { increment: 1 },
            },
          });
        else await tx.mileage.deleteMany({ where: { eventId: event.id } });
        if (new Prisma.Decimal(total).gt(0))
          await tx.expense.upsert({
            where: { eventId: event.id },
            create: {
              carId,
              eventId: event.id,
              amount: total,
              currency: input.currency,
              date: event.date,
              category: service ? input.kind : input.category,
            },
            update: {
              amount: total,
              currency: input.currency,
              date: event.date,
              category: service ? input.kind : input.category,
            },
          });
        else await tx.expense.deleteMany({ where: { eventId: event.id } });
        const targetDate =
          input.kind === 'document' && input.expiresAt
            ? day(input.expiresAt)
            : input.nextMonths
              ? addMonths(event.date, input.nextMonths)
              : null;
        const targetKm =
          input.nextKm && input.odometerKm !== undefined ? input.odometerKm + input.nextKm : null;
        const existing = await tx.reminder.findFirst({ where: { eventId: event.id, status: 'active' } });
        if (targetDate || targetKm !== null) {
          const rem = {
            title: input.kind === 'document' ? `Срок документа: ${input.title}` : `Следующее: ${input.title}`,
            targetDate,
            targetKm,
            baselineDate: event.date,
            repeatKm: input.nextKm ?? null,
            repeatMonths: input.nextMonths ?? null,
          };
          if (existing)
            await tx.reminder.update({
              where: { id: existing.id },
              data: { ...rem, version: { increment: 1 } },
            });
          else await tx.reminder.create({ data: { ...rem, carId, eventId: event.id } });
        } else
          await tx.reminder.updateMany({
            where: { eventId: event.id, status: 'active' },
            data: { status: 'dismissed', version: { increment: 1 } },
          });
        await changed(tx, event.id);
        await audit(
          tx,
          actor,
          carId,
          'event',
          event.id,
          before ? 'update' : 'create',
          before ? eventDto(before, actor.id) : null,
          { ...values, id: event.id },
          event.version,
        );
        await tx.outbox.create({ data: { kind: 'reminders', payload: { carId } } });
        return eventDto(
          await tx.event.findUniqueOrThrow({ where: { id: event.id }, include: eventInclude }),
          actor.id,
        );
      },
      { timeout: 15000 },
    );
  }
  async getEvent(actor: Actor, id: string) {
    const e = await this.db.event.findFirst({
      where: { id: uuid(id), deletedAt: null, ...visibleEvents(actor.id) },
      include: eventInclude,
    });
    if (!e) notFound();
    await own(this.db, actor, e.carId);
    return eventDto(e, actor.id);
  }
  async list(actor: Actor, carId: string, q: any, kind?: string) {
    await own(this.db, actor, carId);
    const p = page(q);
    const filters = z
      .object({
        q: z.string().max(200).optional(),
        from: date.optional(),
        to: date.optional(),
        minKm: z.coerce.number().int().nonnegative().optional(),
        maxKm: z.coerce.number().int().nonnegative().optional(),
        kind: z
          .enum(['maintenance', 'repair', 'expense', 'mileage', 'accident', 'document', 'service'])
          .optional(),
      })
      .parse(q);
    const actual = kind ?? filters.kind;
    const where: Prisma.EventWhereInput = {
      carId,
      deletedAt: null,
      ...visibleEvents(actor.id),
      ...(actual ? { kind: actual === 'service' ? { in: ['maintenance', 'repair'] } : actual } : {}),
      ...(filters.q
        ? {
            AND: [
              {
                OR: [
                  { title: { contains: filters.q, mode: 'insensitive' } },
                  { description: { contains: filters.q, mode: 'insensitive' } },
                ],
              },
            ],
          }
        : {}),
      ...(filters.from || filters.to
        ? {
            date: {
              gte: filters.from ? day(filters.from) : undefined,
              lte: filters.to ? day(filters.to) : undefined,
            },
          }
        : {}),
      ...(filters.minKm !== undefined || filters.maxKm !== undefined
        ? { odometerKm: { gte: filters.minKm, lte: filters.maxKm } }
        : {}),
    };
    const items = await this.db.event.findMany({
      where,
      include: eventInclude,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: p.limit + 1,
      ...(p.cursor ? { cursor: { id: p.cursor }, skip: 1 } : {}),
    });
    return paginated(
      items.map((e) => eventDto(e, actor.id)),
      p.limit,
    );
  }
  async remove(actor: Actor, id: string, version: number) {
    return this.db.$transaction(async (tx) => {
      const e = await tx.event.findFirst({
        where: { id: uuid(id), deletedAt: null, ...visibleEvents(actor.id) },
        include: eventInclude,
      });
      if (!e) notFound();
      await own(tx, actor, e.carId, true);
      const result = await tx.event.updateMany({
        where: { id: e.id, version, deletedAt: null },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      if (!result.count) fail(409, 'RECORD_CONFLICT', 'Запись изменилась. Обновите страницу');
      await tx.reminder.updateMany({
        where: { eventId: id, status: 'active' },
        data: { status: 'dismissed' },
      });
      await changed(tx, id, true);
      await audit(tx, actor, e.carId, 'event', id, 'delete', eventDto(e, actor.id), null, version + 1);
      return { ok: true };
    });
  }
}
@Controller('cars')
export class CarsController {
  constructor(
    @Inject(Db) readonly db: Db,
    @Inject(HistoryService) readonly history: HistoryService,
  ) {}
  @Get() async list(@Req() req: any, @Query() q: any) {
    const p = page(q);
    const items = await this.db.car.findMany({
      where: {
        owners: { some: { userId: req.actor.id, endedAt: null } },
        deletedAt: q.archived === 'true' ? { not: null } : null,
      },
      include: {
        mileage: {
          where: mileageWhere,
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
        },
        events: {
          where: { deletedAt: null, ...visibleEvents(req.actor.id) },
          orderBy: [{ date: 'desc' }, { id: 'desc' }],
          take: 1,
        },
        files: {
          where: {
            photoPosition: { not: null },
            status: 'ready',
            OR: [{ userId: req.actor.id }, { transferAllowed: true }],
          },
          orderBy: { photoPosition: 'asc' },
          take: 4,
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: p.limit + 1,
      ...(p.cursor ? { cursor: { id: p.cursor }, skip: 1 } : {}),
    });
    return paginated(items.map(carDto), p.limit);
  }
  @Post() async create(@Req() req: any, @Body() raw: unknown) {
    const input = carSchema.parse(raw);
    const { odometerKm, date: recorded, purchaseDate, purchasePrice, vin, ...data } = input;
    return this.db.$transaction(async (tx) => {
      const c = await tx.car.create({
        data: {
          ...data,
          vin: vin || null,
          owners: {
            create: {
              userId: req.actor.id,
              currency: input.currency,
              purchaseDate: purchaseDate ? day(purchaseDate) : null,
              purchasePrice,
            },
          },
          mileage: { create: { date: day(recorded), odometerKm, source: 'manual' } },
        },
        include: { mileage: true },
      });
      await audit(tx, req.actor, c.id, 'car', c.id, 'create', null, carDto(c));
      return carDto(c);
    });
  }
  @Get(':id') async get(@Req() req: any, @Param('id') id: string) {
    await own(this.db, req.actor, id, false, true);
    return carDto(
      await this.db.car.findUniqueOrThrow({
        where: { id },
        include: {
          mileage: {
            where: mileageWhere,
            orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
            take: 1,
          },
          files: {
            where: {
              photoPosition: { not: null },
              status: 'ready',
              OR: [{ userId: req.actor.id }, { transferAllowed: true }],
            },
            orderBy: { photoPosition: 'asc' },
          },
        },
      }),
    );
  }
  @Patch(':id') async edit(@Req() req: any, @Param('id') id: string, @Body() raw: any) {
    const schema = carSchema
      .omit({ odometerKm: true, date: true, purchaseDate: true, purchasePrice: true })
      .partial()
      .extend({ version: z.number().int().positive() });
    const data = schema.parse(raw);
    const { version, vin, ...values } = data;
    return this.db.$transaction(async (tx) => {
      const before = await own(tx, req.actor, id, true);
      if (before.version !== version) fail(409, 'RECORD_CONFLICT', 'Автомобиль изменился');
      const c = await tx.car.update({
        where: { id },
        data: { ...values, ...(vin !== undefined ? { vin: vin || null } : {}), version: { increment: 1 } },
      });
      await changed(tx, id);
      await audit(tx, req.actor, id, 'car', id, 'update', carDto(before), carDto(c), c.version);
      return carDto(c);
    });
  }
  @Delete(':id') async archive(@Req() req: any, @Param('id') id: string) {
    return this.db.$transaction(async (tx) => {
      const before = await own(tx, req.actor, id, true);
      await tx.car.update({ where: { id }, data: { deletedAt: new Date(), version: { increment: 1 } } });
      await tx.report.updateMany({ where: { carId: id }, data: { active: false } });
      await tx.invitation.updateMany({
        where: { carId: id, status: 'pending' },
        data: { status: 'cancelled' },
      });
      await audit(tx, req.actor, id, 'car', id, 'archive', carDto(before), null, before.version + 1);
      return { ok: true };
    });
  }
  @Post(':id/restore') async restore(@Req() req: any, @Param('id') id: string) {
    return this.db.$transaction(async (tx) => {
      const before = await own(tx, req.actor, id, true, true);
      const c = await tx.car.update({ where: { id }, data: { deletedAt: null, version: { increment: 1 } } });
      await audit(tx, req.actor, id, 'car', id, 'restore', null, carDto(c), before.version + 1);
      return carDto(c);
    });
  }
  @Get(':id/summary') async summary(@Req() req: any, @Param('id') id: string) {
    await own(this.db, req.actor, id);
    const [count, totals, latest] = await Promise.all([
      this.db.event.count({ where: { carId: id, deletedAt: null, ...visibleEvents(req.actor.id) } }),
      this.db.expense.groupBy({
        by: ['currency'],
        where: { carId: id, event: { deletedAt: null } },
        _sum: { amount: true },
      }),
      this.db.mileage.findFirst({
        where: { carId: id, ...mileageWhere },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      }),
    ]);
    return {
      count,
      totals: totals.map((t) => ({ currency: t.currency, amount: t._sum.amount?.toString() ?? '0' })),
      latestMileage: latest ? { odometerKm: latest.odometerKm, date: latest.date } : null,
    };
  }
  @Get(':id/history') historyList(@Req() req: any, @Param('id') id: string, @Query() q: any) {
    return this.history.list(req.actor, id, q);
  }
  @Get(':id/maintenance') services(@Req() req: any, @Param('id') id: string, @Query() q: any) {
    return this.history.list(req.actor, id, q, 'service');
  }
  @Post(':id/maintenance') service(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    if (!['maintenance', 'repair'].includes(body.kind))
      fail(400, 'VALIDATION_ERROR', 'Укажите ТО или ремонт');
    return this.history.save(req.actor, id, body, req.headers['idempotency-key']);
  }
  @Post(':id/events') event(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    return this.history.save(req.actor, id, body, req.headers['idempotency-key']);
  }
  @Get(':id/mileage') async mileage(@Req() req: any, @Param('id') id: string, @Query() q: any) {
    await own(this.db, req.actor, id);
    const p = page(q);
    const readings = await this.db.mileage.findMany({
      where: { carId: id, ...mileageWhere },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: p.limit + 1,
      ...(p.cursor ? { cursor: { id: p.cursor }, skip: 1 } : {}),
    });
    return paginated(
      readings.map((r) => ({
        id: r.id,
        eventId: r.eventId,
        date: r.date,
        odometerKm: r.odometerKm,
        source: r.source,
        changeType: r.changeType,
        reason: r.reason,
        confirmed: r.confirmed,
        version: r.version,
      })),
      p.limit,
    );
  }
  @Get(':id/parts') async parts(@Req() req: any, @Param('id') id: string, @Query() q: any) {
    await own(this.db, req.actor, id);
    const p = page(q);
    const [parts, latest, replacements] = await Promise.all([
      this.db.part.findMany({
        where: { event: { carId: id, deletedAt: null } },
        include: { event: { select: { date: true, odometerKm: true, title: true } } },
        orderBy: [{ event: { date: 'desc' } }, { id: 'desc' }],
        take: p.limit + 1,
        ...(p.cursor ? { cursor: { id: p.cursor }, skip: 1 } : {}),
      }),
      this.db.mileage.findFirst({
        where: { carId: id, ...mileageWhere },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.db.mileage.findMany({
        where: { carId: id, changeType: 'replacement', ...mileageWhere },
        select: { date: true },
      }),
    ]);
    const positions = await this.db.part.findMany({
      where: {
        position: { in: parts.map((p) => p.position).filter(Boolean) as string[] },
        event: { carId: id, deletedAt: null },
      },
      include: { event: { select: { date: true, odometerKm: true } } },
      orderBy: [{ event: { date: 'desc' } }, { id: 'desc' }],
    });
    return paginated(
      parts.map((p) => {
        const replaced = p.position
          ? positions.find((x) => x.position === p.position && x.event.date > p.event.date)
          : null;
        const endDate = replaced?.event.date ?? latest?.date;
        const endKm = replaced?.event.odometerKm ?? latest?.odometerKm;
        const distance =
          endKm != null &&
          p.event.odometerKm != null &&
          endKm >= p.event.odometerKm &&
          !replacements.some((r) => r.date >= p.event.date && endDate && r.date <= endDate)
            ? endKm - p.event.odometerKm
            : null;
        return {
          id: p.id,
          eventId: p.eventId,
          name: p.name,
          brand: p.brand,
          article: p.article,
          quantity: p.quantity.toString(),
          unitPrice: p.unitPrice.toString(),
          unit: p.unit,
          position: p.position,
          date: p.event.date,
          odometerKm: p.event.odometerKm,
          warrantyUntil: p.warrantyUntil,
          warrantyKm: p.warrantyKm,
          distance,
          replaced: !!replaced,
        };
      }),
      p.limit,
    );
  }
  @Get(':id/expenses') async expenses(@Req() req: any, @Param('id') id: string, @Query() q: any) {
    await own(this.db, req.actor, id);
    const p = page(q);
    const rows = await this.db.expense.findMany({
      where: {
        carId: id,
        event: { deletedAt: null },
        ...(q.from||q.to?{date:{gte:q.from?day(date.parse(q.from)):undefined,lte:q.to?day(date.parse(q.to)):undefined}}:{}),
        ...(q.currency ? { currency: z.enum(['KGS', 'KZT', 'USD', 'EUR']).parse(q.currency) } : {}),
        ...(q.category ? { category: z.string().max(50).parse(q.category) } : {}),
      },
      include: { event: { select: { title: true, kind: true, version: true, odometerKm: true } } },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: p.limit + 1,
      ...(p.cursor ? { cursor: { id: p.cursor }, skip: 1 } : {}),
    });
    return paginated(
      rows.map((e) => ({
        id: e.id,
        eventId: e.eventId,
        title: e.event.title,
        kind: e.event.kind,
        version: e.event.version,
        amount: e.amount.toString(),
        currency: e.currency,
        date: e.date,
        category: e.category,
        odometerKm: e.event.odometerKm,
      })),
      p.limit,
    );
  }
  @Get(':id/expenses/stats') async stats(@Req() req: any, @Param('id') id: string, @Query() q: any) {
    await own(this.db, req.actor, id);
    const f = z
      .object({
        from: date.optional(),
        to: date.optional(),
        currency: z.enum(['KGS', 'KZT', 'USD', 'EUR']).optional(),
        category: z.string().max(50).optional(),
      })
      .parse(q);
    const from = f.from ? day(f.from) : new Date('1900-01-01'),
      to = f.to ? day(f.to) : new Date('2200-01-01');
    const rows = await this.db.$queryRaw<
      any[]
    >`SELECT e.currency,e.category,to_char(e.date,'YYYY-MM') AS month,sum(e.amount)::text AS amount FROM "Expense" e JOIN "Event" v ON v.id=e."eventId" WHERE e."carId"=${id}::uuid AND v."deletedAt" IS NULL AND e.date>=${from} AND e.date<=${to} AND (${f.currency ?? null}::text IS NULL OR e.currency=${f.currency ?? null}) AND (${f.category ?? null}::text IS NULL OR e.category=${f.category ?? null}) GROUP BY e.currency,e.category,month ORDER BY month`;
    const totals: Record<string, Prisma.Decimal> = {};
    for (const r of rows) totals[r.currency] = (totals[r.currency] ?? new Prisma.Decimal(0)).plus(r.amount);
    return {
      rows,
      totals: Object.entries(totals).map(([currency, amount]) => ({ currency, amount: amount.toFixed(2) })),
    };
  }
  @Get(':id/accidents') accidents(@Req() req: any, @Param('id') id: string, @Query() q: any) {
    return this.history.list(req.actor, id, q, 'accident');
  }
  @Get(':id/documents') documents(@Req() req: any, @Param('id') id: string, @Query() q: any) {
    return this.history.list(req.actor, id, q, 'document');
  }
  @Get(':id/audit') async logs(@Req() req: any, @Param('id') id: string, @Query() q: any) {
    await own(this.db, req.actor, id, false, true);
    const p = page(q);
    const logs = await this.db.audit.findMany({
      where: { carId: id, actorId: req.actor.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: p.limit + 1,
      ...(p.cursor ? { cursor: { id: p.cursor }, skip: 1 } : {}),
    });
    return paginated(
      logs.map((a) => ({
        id: a.id,
        entityType: a.entityType,
        entityId: a.entityId,
        action: a.action,
        oldData: a.oldData,
        newData: a.newData,
        version: a.version,
        createdAt: a.createdAt,
        requestId: a.requestId,
      })),
      p.limit,
    );
  }
}
@Controller()
export class EventsController {
  constructor(@Inject(HistoryService) readonly history: HistoryService) {}
  @Get('events/:id') get(@Req() req: any, @Param('id') id: string) {
    return this.history.getEvent(req.actor, id);
  }
  @Get('maintenance/:id') getService(@Req() req: any, @Param('id') id: string) {
    return this.history.getEvent(req.actor, id);
  }
  @Patch('events/:id') async patch(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const e = await this.history.getEvent(req.actor, id);
    return this.history.save(req.actor, e.carId, body, undefined, id);
  }
  @Patch('maintenance/:id') patchService(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.patch(req, id, body);
  }
  @Delete('events/:id') remove(@Req() req: any, @Param('id') id: string, @Query('version') version: string) {
    return this.history.remove(req.actor, id, z.coerce.number().int().positive().parse(version));
  }
  @Delete('maintenance/:id') removeService(
    @Req() req: any,
    @Param('id') id: string,
    @Query('version') version: string,
  ) {
    return this.remove(req, id, version);
  }
}
