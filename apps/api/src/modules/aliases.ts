import { Body, Controller, Delete, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { HistoryService } from './history';
import { Db, fail, notFound, own } from '../common/core';
// Compatibility routes keep a single implementation for all transactional history writes.
@Controller()
export class AliasesController {
  constructor(
    @Inject(Db) readonly db: Db,
    @Inject(HistoryService) readonly history: HistoryService,
  ) {}
  @Post(['cars/:id/expenses', 'cars/:id/mileage', 'cars/:id/accidents', 'cars/:id/documents']) create(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const plural = req.path.split('/').at(-1);
    const kind = (
      { expenses: 'expense', mileage: 'mileage', accidents: 'accident', documents: 'document' } as any
    )[plural];
    return this.history.save(req.actor, id, { ...body, kind }, req.headers['idempotency-key']);
  }
  async source(req: any, id: string) {
    z.string().uuid().parse(id);
    const resource = req.path.split('/').at(-2);
    let eventId = id;
    if (resource === 'expenses') {
      const e = await this.db.expense.findUnique({ where: { id }, include: { event: true } });
      if (!e) notFound();
      await own(this.db, req.actor, e.carId);
      if (e.event.kind !== 'expense') fail(409, 'EDIT_SOURCE', 'Измените исходную запись обслуживания');
      eventId = e.eventId;
    }
    if (resource === 'mileage') {
      const m = await this.db.mileage.findUnique({ where: { id }, include: { event: true } });
      if (!m) notFound();
      await own(this.db, req.actor, m.carId);
      if (!m.eventId || m.event?.kind !== 'mileage')
        fail(409, 'EDIT_SOURCE', 'Добавьте исправление показания или измените исходную запись');
      eventId = m.eventId;
    }
    const event = await this.history.getEvent(req.actor, eventId);
    const expected = (
      { expenses: 'expense', mileage: 'mileage', accidents: 'accident', documents: 'document' } as any
    )[resource];
    if (event.kind !== expected) notFound();
    return event;
  }
  @Patch(['expenses/:id', 'mileage/:id', 'accidents/:id', 'documents/:id']) async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const e = await this.source(req, id);
    return this.history.save(req.actor, e.carId, { ...body, kind: e.kind }, undefined, e.id);
  }
  @Delete(['expenses/:id', 'mileage/:id', 'accidents/:id', 'documents/:id']) async remove(
    @Req() req: any,
    @Param('id') id: string,
    @Query('version') v: string,
  ) {
    const e = await this.source(req, id);
    return this.history.remove(req.actor, e.id, z.coerce.number().int().positive().parse(v));
  }
  @Patch('service-centers/:id') async center(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const input = z
      .object({
        name: z.string().min(1).max(100),
        address: z.string().max(300),
        phone: z.string().max(40),
        note: z.string().max(1000),
      })
      .strict()
      .parse(body);
    const result = await this.db.serviceCenter.updateMany({
      where: { id: z.string().uuid().parse(id), userId: req.actor.id },
      data: input,
    });
    if (!result.count) notFound();
    return { id, ...input };
  }
}
