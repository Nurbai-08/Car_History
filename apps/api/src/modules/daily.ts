import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { reminderSchema, email } from '@carhistory/validation';
import {
  Db,
  audit,
  day,
  fail,
  hash,
  notFound,
  own,
  page,
  paginated,
  randomToken,
  uuid,
  visibleEvents,
} from '../common/core';
import { addMonths, reminderState } from '../common/domain';
@Controller()
export class DailyController {
  constructor(@Inject(Db) readonly db: Db) {}
  @Get('dashboard') async dashboard(@Req() req: any) {
    const access = { deletedAt: null, owners: { some: { userId: req.actor.id, endedAt: null } } };
    const [totals, carTotals, eventCount, events, reminders] = await Promise.all([
      this.db.expense.groupBy({
        by: ['currency'],
        where: {
          car: access,
          event: { deletedAt: null },
          date: { gte: new Date(Date.UTC(new Date().getFullYear(), 0, 1)) },
        },
        _sum: { amount: true },
      }),
      this.db.expense.groupBy({
        by: ['carId', 'currency'],
        where: {
          car: access,
          event: { deletedAt: null },
          date: { gte: new Date(Date.UTC(new Date().getFullYear(), 0, 1)) },
        },
        _sum: { amount: true },
      }),
      this.db.event.count({ where: { car: access, deletedAt: null, ...visibleEvents(req.actor.id) } }),
      this.db.event.findMany({
        where: { car: access, deletedAt: null, ...visibleEvents(req.actor.id) },
        select: {
          id: true,
          carId: true,
          title: true,
          date: true,
          car: { select: { brand: true, model: true } },
        },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: 5,
      }),
      this.db.reminder.findMany({
        where: { car: access, status: 'active' },
        include: {
          car: {
            include: {
              mileage: {
                where: { OR: [{ eventId: null }, { event: { deletedAt: null } }] },
                orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
                take: 1,
              },
            },
          },
        },
        take: 500,
      }),
    ]);
    const attention = reminders
      .map((r) => ({
        id: r.id,
        title: r.title,
        carId: r.carId,
        carName: `${r.car.brand} ${r.car.model}`,
        targetDate: r.targetDate,
        targetKm: r.targetKm,
        urgency: reminderState(
          r,
          r.car.mileage[0]?.changeType === 'replacement' ? null : (r.car.mileage[0]?.odometerKm ?? null),
        ),
      }))
      .filter((r) => r.urgency !== 'upcoming')
      .sort(
        (a, b) =>
          (a.urgency === 'overdue' ? 0 : 1) - (b.urgency === 'overdue' ? 0 : 1) ||
          (a.targetDate?.getTime() ?? Infinity) - (b.targetDate?.getTime() ?? Infinity),
      );
    return {
      totals: totals.map((t) => ({ currency: t.currency, amount: t._sum.amount?.toString() ?? '0' })),
      carTotals: carTotals.map((t) => ({
        carId: t.carId,
        currency: t.currency,
        amount: t._sum.amount?.toString() ?? '0',
      })),
      eventCount,
      events: events.map((e) => ({
        id: e.id,
        carId: e.carId,
        title: e.title,
        date: e.date,
        carName: `${e.car.brand} ${e.car.model}`,
      })),
      attention,
    };
  }
  @Get('cars/:id/reminders') async reminders(@Req() req: any, @Param('id') id: string, @Query() q: any) {
    await own(this.db, req.actor, id);
    const p = page(q);
    const [rows, latest, replacement] = await Promise.all([
      this.db.reminder.findMany({
        where: { carId: id, status: q.status === 'completed' ? 'completed' : 'active' },
        orderBy: [{ targetDate: 'asc' }, { id: 'asc' }],
        take: p.limit + 1,
        ...(p.cursor ? { cursor: { id: p.cursor }, skip: 1 } : {}),
      }),
      this.db.mileage.findFirst({
        where: { carId: id, OR: [{ eventId: null }, { event: { deletedAt: null } }] },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.db.mileage.findFirst({
        where: { carId: id, changeType: 'replacement', event: { deletedAt: null } },
        orderBy: { date: 'desc' },
      }),
    ]);
    return paginated(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        targetDate: r.targetDate,
        targetKm: r.targetKm,
        repeatKm: r.repeatKm,
        repeatMonths: r.repeatMonths,
        status: r.status,
        version: r.version,
        soonDays: r.soonDays,
        soonKm: r.soonKm,
        kmUncertain: !!(replacement && (!r.baselineDate || replacement.date > r.baselineDate)),
        urgency: reminderState(
          r,
          replacement && (!r.baselineDate || replacement.date > r.baselineDate)
            ? null
            : (latest?.odometerKm ?? null),
        ),
      })),
      p.limit,
    );
  }
  @Post('cars/:id/reminders') async reminder(@Req() req: any, @Param('id') id: string, @Body() raw: unknown) {
    const input = reminderSchema.parse(raw);
    return this.db.$transaction(async (tx) => {
      await own(tx, req.actor, id, true);
      const r = await tx.reminder.create({
        data: {
          ...input,
          carId: id,
          targetDate: input.targetDate ? day(input.targetDate) : null,
          baselineDate: new Date(),
        },
      });
      await audit(tx, req.actor, id, 'reminder', r.id, 'create', null, r);
      await tx.outbox.create({ data: { kind: 'reminders', payload: { carId: id } } });
      return r;
    });
  }
  @Patch('reminders/:id') async updateReminder(@Req() req: any, @Param('id') id: string, @Body() raw: any) {
    const input = z
      .object({
        status: z.enum(['active', 'completed', 'dismissed']).optional(),
        version: z.number().int().positive(),
        repeat: z.boolean().default(false),
        values: reminderSchema.optional(),
      })
      .strict()
      .parse(raw);
    return this.db.$transaction(async (tx) => {
      const r = await tx.reminder.findUnique({ where: { id: uuid(id) } });
      if (!r) notFound();
      await own(tx, req.actor, r.carId, true);
      const won = await tx.reminder.updateMany({
        where: { id, version: input.version },
        data: {
          status: input.status,
          ...(input.values
            ? {
                ...input.values,
                targetDate: input.values.targetDate ? day(input.values.targetDate) : null,
                targetKm: input.values.targetKm ?? null,
              }
            : {}),
          completedAt: input.status === 'completed' ? new Date() : null,
          version: { increment: 1 },
        },
      });
      if (!won.count) fail(409, 'RECORD_CONFLICT', 'Напоминание уже изменилось');
      if (input.repeat && input.status === 'completed' && (r.repeatKm || r.repeatMonths)) {
        const latest = await tx.mileage.findFirst({
          where: { carId: r.carId, OR: [{ eventId: null }, { event: { deletedAt: null } }] },
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        });
        await tx.reminder.create({
          data: {
            carId: r.carId,
            title: r.title,
            description: r.description,
            targetDate: r.repeatMonths ? addMonths(new Date(), r.repeatMonths) : null,
            targetKm: r.repeatKm && latest ? latest.odometerKm + r.repeatKm : null,
            repeatKm: r.repeatKm,
            repeatMonths: r.repeatMonths,
            baselineDate: new Date(),
          },
        });
      }
      await audit(tx, req.actor, r.carId, 'reminder', id, 'update', r, input, r.version + 1);
      return { ok: true };
    });
  }
  @Delete('reminders/:id') removeReminder(
    @Req() req: any,
    @Param('id') id: string,
    @Query('version') version: string,
  ) {
    return this.updateReminder(req, id, { status: 'dismissed', version: Number(version) });
  }
  @Get('notifications') async notifications(@Req() req: any, @Query() q: any) {
    const p = page(q);
    const items = await this.db.notification.findMany({
      where: { userId: req.actor.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: p.limit + 1,
      ...(p.cursor ? { cursor: { id: p.cursor }, skip: 1 } : {}),
    });
    return paginated(
      items.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        carId: n.carId,
        readAt: n.readAt,
        createdAt: n.createdAt,
      })),
      p.limit,
    );
  }
  @Patch('notifications/:id/read') async read(@Req() req: any, @Param('id') id: string) {
    await this.db.notification.updateMany({
      where: { id: uuid(id), userId: req.actor.id },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
  @Post('cars/:id/ownership-invitations') async invite(
    @Req() req: any,
    @Param('id') id: string,
    @Body() raw: unknown,
  ) {
    const input = z.object({ email }).strict().parse(raw),
      token = randomToken();
    return this.db.$transaction(async (tx) => {
      await own(tx, req.actor, id, true);
      const user = await tx.user.findUniqueOrThrow({ where: { id: req.actor.id } });
      if (!user.emailVerifiedAt) fail(400, 'VERIFY_EMAIL', 'Сначала подтвердите ваш email');
      if (user.email === input.email) fail(400, 'VALIDATION_ERROR', 'Укажите email другого владельца');
      const invite = await tx.invitation.create({
        data: {
          carId: id,
          senderId: req.actor.id,
          email: input.email,
          hash: hash(token),
          expiresAt: new Date(Date.now() + 7 * 86400000),
        },
      });
      await tx.outbox.create({
        data: {
          kind: 'email',
          payload: {
            to: input.email,
            subject: 'Передача автомобиля в CarHistory',
            text: `Вам предлагают принять автомобиль. Техническая история будет передана, приватные документы останутся закрытыми. Откройте ${process.env.FRONTEND_URL}/transfer?token=${token}`,
          },
        },
      });
      await audit(tx, req.actor, id, 'invitation', invite.id, 'create', null, {
        expiresAt: invite.expiresAt,
      });
      return { id: invite.id, email: input.email, expiresAt: invite.expiresAt, status: invite.status };
    });
  }
  @Get('cars/:id/ownership-invitations') async invites(@Req() req: any, @Param('id') id: string) {
    await own(this.db, req.actor, id);
    return {
      items: await this.db.invitation.findMany({
        where: { carId: id, senderId: req.actor.id },
        select: { id: true, email: true, status: true, expiresAt: true },
        take: 100,
      }),
    };
  }
  @Delete('ownership-invitations/:id') async cancel(@Req() req: any, @Param('id') id: string) {
    return this.db.$transaction(async (tx) => {
      const i = await tx.invitation.findUnique({ where: { id: uuid(id) } });
      if (!i || i.senderId !== req.actor.id) notFound();
      await own(tx, req.actor, i.carId, true);
      await tx.invitation.updateMany({ where: { id, status: 'pending' }, data: { status: 'cancelled' } });
      await audit(tx, req.actor, i.carId, 'invitation', id, 'cancel', null, null);
      return { ok: true };
    });
  }
  @Post('ownership-invitations/accept') async accept(@Req() req: any, @Body() raw: unknown) {
    const { token } = z
      .object({ token: z.string().min(20).max(200) })
      .strict()
      .parse(raw);
    return this.db.$transaction(async (tx) => {
      const initial = await tx.invitation.findUnique({ where: { hash: hash(token) } });
      if (!initial) notFound();
      await tx.$queryRaw`SELECT id FROM "Car" WHERE id=${initial.carId}::uuid FOR UPDATE`;
      const i = await tx.invitation.findUniqueOrThrow({ where: { id: initial.id } }),
        user = await tx.user.findUniqueOrThrow({ where: { id: req.actor.id } });
      if (!user.emailVerifiedAt || user.email !== i.email)
        fail(400, 'VERIFY_EMAIL', 'Войдите с подтверждённым email получателя');
      if (i.status === 'accepted') {
        const owner = await tx.owner.findFirst({ where: { carId: i.carId, userId: user.id, endedAt: null } });
        if (owner) return { carId: i.carId };
      }
      if (i.status !== 'pending' || i.expiresAt < new Date())
        fail(400, 'INVITATION_INVALID', 'Приглашение недействительно');
      const car = await tx.car.findFirst({
        where: { id: i.carId, deletedAt: null, owners: { some: { userId: i.senderId, endedAt: null } } },
      });
      if (!car) notFound();
      await tx.owner.updateMany({ where: { carId: car.id, endedAt: null }, data: { endedAt: new Date() } });
      await tx.owner.create({ data: { carId: car.id, userId: user.id, currency: car.currency } });
      await tx.invitation.update({ where: { id: i.id }, data: { status: 'accepted' } });
      await tx.invitation.updateMany({
        where: { carId: car.id, status: 'pending' },
        data: { status: 'cancelled' },
      });
      await tx.report.updateMany({ where: { carId: car.id }, data: { active: false } });
      await audit(tx, req.actor, car.id, 'car', car.id, 'transfer', null, {
        technicalHistory: true,
        privateDocuments: false,
      });
      return { carId: car.id };
    });
  }
  @Get('search') async search(@Req() req: any, @Query('q') query: string) {
    const q = z.string().trim().min(2).max(100).parse(query);
    const access = { deletedAt: null, owners: { some: { userId: req.actor.id, endedAt: null } } };
    const [cars, events, parts] = await Promise.all([
      this.db.car.findMany({
        where: {
          ...access,
          OR: [
            { brand: { contains: q, mode: 'insensitive' } },
            { model: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, brand: true, model: true },
        take: 8,
      }),
      this.db.event.findMany({
        where: {
          deletedAt: null,
          car: access,
          AND: [
            visibleEvents(req.actor.id),
            {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
                ...(/^\d{4}-\d{2}-\d{2}$/.test(q) && !isNaN(Date.parse(q)) ? [{ date: day(q) }] : []),
              ],
            },
          ],
        },
        select: { id: true, carId: true, title: true, kind: true, date: true },
        take: 12,
      }),
      this.db.part.findMany({
        where: {
          event: { deletedAt: null, car: access },
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { article: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, event: { select: { id: true, carId: true } } },
        take: 10,
      }),
    ]);
    return { cars, events, parts };
  }
  @Get('service-centers') async centers(@Req() req: any) {
    return {
      items: await this.db.serviceCenter.findMany({
        where: { userId: req.actor.id },
        select: { id: true, name: true, address: true, phone: true, note: true },
        take: 100,
      }),
    };
  }
  @Post('service-centers') async center(@Req() req: any, @Body() raw: unknown) {
    const data = z
      .object({
        name: z.string().min(1).max(100),
        address: z.string().max(300).default(''),
        phone: z.string().max(40).default(''),
        note: z.string().max(1000).default(''),
      })
      .strict()
      .parse(raw);
    const c = await this.db.serviceCenter.create({ data: { ...data, userId: req.actor.id } });
    return { id: c.id, ...data };
  }
}
