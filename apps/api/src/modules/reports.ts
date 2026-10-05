import { Body, Controller, Delete, Get, Inject, Injectable, Param, Patch, Post, Req } from '@nestjs/common';
import { reportSchema, reportSettingsSchema, type ReportSettings } from '@carhistory/validation';
import {
  Actor,
  Db,
  Tx,
  audit,
  fail,
  json,
  notFound,
  own,
  randomToken,
  uuid,
  visibleEvents,
} from '../common/core';
import { maskVin } from '../common/domain';
import { Public } from './auth';
import { eventInclude } from './history';
@Injectable()
export class ReportsService {
  constructor(@Inject(Db) readonly db: Db) {}
  async snapshot(tx: Tx, actor: Actor, carId: string, settings: ReportSettings, previous: any[] = []) {
    const car = await own(tx, actor, carId);
    const selectedKinds = ['maintenance', 'repair', 'mileage', 'accident', 'expense', 'document'].filter(
      (k) => (settings as any)[k],
    );
    const events = await tx.event.findMany({
      where: {
        carId,
        deletedAt: null,
        kind: { in: selectedKinds },
        ...visibleEvents(actor.id),
        ...(settings.eventIds ? { id: { in: settings.eventIds } } : {}),
      },
      include: eventInclude,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: 2001,
    });
    if (events.length > 2000)
      fail(400, 'REPORT_TOO_LARGE', 'Выберите не более 2000 событий для одного отчёта');
    const files = await tx.file.findMany({
      where: {
        id: { in: settings.fileIds },
        carId,
        status: 'ready',
        OR: [{ userId: actor.id }, { transferAllowed: true }],
        AND: [
          {
            OR: [
              { photoPosition: { not: null } },
              { attachments: { some: { eventId: { in: events.map((e) => e.id) } } } },
            ],
          },
        ],
      },
    });
    if (files.length !== new Set(settings.fileIds).size)
      fail(400, 'FILE_NOT_PUBLISHABLE', 'Файл недоступен либо его событие не включено в отчёт');
    const readings = settings.mileage
      ? await tx.mileage.findMany({
          where: { carId, OR: [{ eventId: null }, { eventId: { in: events.map((e) => e.id) } }] },
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
          take: 2000,
        })
      : [];
    const dto = {
      car: {
        brand: car.brand,
        model: car.model,
        year: car.year,
        vin: maskVin(car.vin),
        ...(settings.licensePlate ? { licensePlate: car.licensePlate } : {}),
      },
      disclaimer:
        'Сведения добавлены владельцем. Отчёт содержит только выбранную часть истории и не является независимой проверкой автомобиля.',
      excluded: [
        'maintenance',
        'repair',
        'mileage',
        'parts',
        'accident',
        'expense',
        'document',
        'licensePlate',
      ].filter((k) => !(settings as any)[k]),
      events: events.map((e) => ({
        id: e.id,
        kind: e.kind,
        title: e.title,
        date: e.date,
        description: e.description,
        odometerKm: settings.mileage ? e.odometerKm : null,
        ...(settings.expense ? { totalCost: e.totalCost.toString(), currency: e.currency } : {}),
        ...(settings.parts
          ? {
              parts: e.parts.map((p) => ({
                name: p.name,
                brand: p.brand,
                article: p.article,
                quantity: p.quantity.toString(),
                unit: p.unit,
                position: p.position,
              })),
            }
          : {}),
        ...(e.kind === 'accident'
          ? { severity: (e.data as any).severity, zones: (e.data as any).zones }
          : {}),
        files: files
          .filter((f) => e.attachments.some((a) => a.fileId === f.id))
          .map((f) => ({ id: f.id, name: f.originalName, mime: f.mime })),
      })),
      mileage: readings.map((r) => ({ date: r.date, odometerKm: r.odometerKm, changeType: r.changeType })),
      photos: files.filter((f) => f.photoPosition !== null).map((f) => ({ id: f.id, name: f.originalName })),
      changes: previous
        .filter((p) => p.changed)
        .map((p) => ({
          message: p.deleted
            ? 'Ранее опубликованная запись удалена владельцем'
            : 'Ранее опубликованная запись изменена владельцем',
          entityId: p.entityId,
        })),
    };
    return { dto, events, files, car };
  }
  async publish(tx: Tx, actor: Actor, report: any) {
    const previous = await tx.reportItem.findMany({
      where: { reportVersion: { reportId: report.id }, changed: true },
    });
    const { dto, events, files, car } = await this.snapshot(
      tx,
      actor,
      report.carId,
      reportSettingsSchema.parse(report.settings),
      previous,
    );
    const version = report.currentVersion + 1;
    await tx.reportVersion.create({
      data: {
        reportId: report.id,
        version,
        snapshot: json(dto),
        items: {
          create: [
            { entityId: car.id, sourceVersion: car.version },
            ...events.map((e) => ({ entityId: e.id, sourceVersion: e.version })),
          ],
        },
        files: { create: files.map((f) => ({ fileId: f.id })) },
      },
    });
    const updated = await tx.report.update({ where: { id: report.id }, data: { currentVersion: version } });
    await audit(
      tx,
      actor,
      report.carId,
      'report',
      report.id,
      'publish',
      null,
      { title: report.title, version, settings: report.settings },
      version,
    );
    return this.dto(updated);
  }
  dto(r: any) {
    return {
      id: r.id,
      title: r.title,
      token: r.token,
      active: r.active,
      expiresAt: r.expiresAt,
      currentVersion: r.currentVersion,
      settings: r.settings,
      createdAt: r.createdAt,
      url: `${process.env.FRONTEND_URL}/r/${r.token}`,
    };
  }
  async public(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) notFound();
    const r = await this.db.report.findFirst({
      where: {
        token,
        active: true,
        car: { deletedAt: null },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (!r) notFound();
    const v = await this.db.reportVersion.findUnique({
      where: { reportId_version: { reportId: r.id, version: r.currentVersion } },
      include: { items: { where: { changed: true } } },
    });
    if (!v) notFound();
    return {
      title: r.title,
      publishedAt: r.createdAt,
      updatedAt: v.createdAt,
      version: v.version,
      ...(v.snapshot as any),
      hasChanges: v.items.length > 0,
      changeNotices: v.items.map((i) => ({
        entityId: i.entityId,
        message: i.deleted
          ? 'После публикации запись удалена владельцем. В отчёте сохранён снимок.'
          : 'После публикации данные изменены. В отчёте сохранён снимок.',
      })),
    };
  }
}
@Controller()
export class ReportsController {
  constructor(@Inject(ReportsService) readonly reports: ReportsService) {}
  @Get('cars/:id/public-reports') async list(@Req() req: any, @Param('id') id: string) {
    await own(this.reports.db, req.actor, id);
    return {
      items: (
        await this.reports.db.report.findMany({
          where: { carId: id, createdBy: req.actor.id },
          orderBy: { createdAt: 'desc' },
          take: 100,
        })
      ).map((r) => this.reports.dto(r)),
    };
  }
  @Post('cars/:id/public-reports/preview') async preview(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = reportSchema.parse(body);
    return this.reports.db.$transaction(async (tx) => {
      await own(tx, req.actor, id, true);
      return (await this.reports.snapshot(tx, req.actor, id, input.settings)).dto;
    });
  }
  @Post('cars/:id/public-reports') async create(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = reportSchema.parse(body);
    return this.reports.db.$transaction(async (tx) => {
      await own(tx, req.actor, id, true);
      const r = await tx.report.create({
        data: {
          carId: id,
          createdBy: req.actor.id,
          token: randomToken(),
          title: input.title,
          settings: json(input.settings),
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        },
      });
      return this.reports.publish(tx, req.actor, r);
    });
  }
  @Post('public-reports/:id/publish') async publish(@Req() req: any, @Param('id') id: string) {
    return this.reports.db.$transaction(async (tx) => {
      const initial = await tx.report.findUnique({ where: { id: uuid(id) } });
      if (!initial) notFound();
      await own(tx, req.actor, initial.carId, true);
      const r = await tx.report.findUniqueOrThrow({ where: { id } });
      if (!r.active || r.createdBy !== req.actor.id) notFound();
      return this.reports.publish(tx, req.actor, r);
    });
  }
  @Patch('public-reports/:id') async edit(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const input = reportSchema.parse(body);
    return this.reports.db.$transaction(async (tx) => {
      const r = await tx.report.findUnique({ where: { id: uuid(id) } });
      if (!r || r.createdBy !== req.actor.id) notFound();
      await own(tx, req.actor, r.carId, true);
      const updated = await tx.report.update({
        where: { id },
        data: {
          title: input.title,
          settings: json(input.settings),
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        },
      });
      await audit(
        tx,
        req.actor,
        r.carId,
        'report',
        id,
        'update',
        null,
        { title: input.title, settings: input.settings },
        r.currentVersion,
      );
      return this.reports.dto(updated);
    });
  }
  @Delete('public-reports/:id') async revoke(@Req() req: any, @Param('id') id: string) {
    return this.reports.db.$transaction(async (tx) => {
      const r = await tx.report.findUnique({ where: { id: uuid(id) } });
      if (!r || r.createdBy !== req.actor.id) notFound();
      await own(tx, req.actor, r.carId, true, true);
      await tx.report.update({ where: { id }, data: { active: false } });
      await audit(tx, req.actor, r.carId, 'report', id, 'revoke', null, null, r.currentVersion);
      return { ok: true };
    });
  }
  @Public() @Get('public/reports/:token') report(@Param('token') token: string) {
    return this.reports.public(token);
  }
}
