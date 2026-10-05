import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z, ZodError } from 'zod';
import type { Request, Response } from 'express';
export type Actor = { id: string; sid: string; requestId: string };
export type Tx = Prisma.TransactionClient;
export const randomToken = () => randomBytes(32).toString('base64url');
export const hash = (v: string) => createHash('sha256').update(v).digest('hex');
export const json = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v));
export const day = (v: string) => new Date(`${v}T00:00:00.000Z`);
export const today = () => new Date().toISOString().slice(0, 10);
export const uuid = (v: string) => z.string().uuid().parse(v);
export function fail(status: number, code: string, message: string): never {
  throw new HttpException({ code, message }, status);
}
export function notFound(): never {
  return fail(404, 'NOT_FOUND', 'Запись не найдена или недоступна');
}
export function page(query: any) {
  return z
    .object({
      limit: z.coerce.number().int().min(1).max(100).default(30),
      cursor: z.string().uuid().optional(),
    })
    .parse(query);
}
export function paginated<T extends { id: string }>(items: T[], limit: number) {
  const more = items.length > limit;
  return { items: items.slice(0, limit), nextCursor: more ? items[limit - 1].id : null };
}
@Injectable()
export class Db extends PrismaClient {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
export async function own(tx: Tx, actor: Actor, carId: string, lock = false, archived = false) {
  uuid(carId);
  if (lock) await tx.$queryRaw`SELECT id FROM "Car" WHERE id = ${carId}::uuid FOR UPDATE`;
  const car = await tx.car.findFirst({
    where: {
      id: carId,
      ...(!archived ? { deletedAt: null } : {}),
      owners: { some: { userId: actor.id, endedAt: null } },
    },
  });
  return car ?? notFound();
}
export async function audit(
  tx: Tx,
  actor: Actor,
  carId: string,
  entityType: string,
  entityId: string,
  action: string,
  before: unknown,
  after: unknown,
  version = 1,
) {
  await tx.audit.create({
    data: {
      actorId: actor.id,
      carId,
      entityType,
      entityId,
      action,
      oldData: before ? json(before) : Prisma.JsonNull,
      newData: after ? json(after) : Prisma.JsonNull,
      version,
      requestId: actor.requestId,
    },
  });
}
export async function changed(tx: Tx, id: string, deleted = false) {
  await tx.reportItem.updateMany({
    where: { entityId: id },
    data: { changed: true, ...(deleted ? { deleted: true } : {}) },
  });
}
export const visibleEvents = (userId: string) => ({
  OR: [{ kind: { not: 'document' } }, { createdBy: userId }, { transferAllowed: true }],
});
export function requestContext(req: Request, _res: Response, next: () => void) {
  (req as any).requestId = randomUUID();
  next();
}
@Catch()
export class Errors implements ExceptionFilter {
  catch(error: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp(),
      req = ctx.getRequest(),
      res = ctx.getResponse();
    let status = 500,
      code = 'INTERNAL_ERROR',
      message = 'Не удалось выполнить запрос. Попробуйте ещё раз.',
      fieldErrors: unknown = undefined;
    if (error instanceof ZodError) {
      status = 400;
      code = 'VALIDATION_ERROR';
      message = 'Проверьте заполненные поля';
      fieldErrors = error.flatten().fieldErrors;
    } else if (error instanceof HttpException) {
      status = error.getStatus();
      const body: any = error.getResponse();
      code = body.code ?? 'REQUEST_ERROR';
      message = body.message ?? message;
    } else if (error?.code === 'P2002') {
      status = 409;
      code = 'RECORD_CONFLICT';
      message = 'Не удалось сохранить: запись уже существует';
    } else if (error?.code === 'P2025') {
      status = 404;
      code = 'NOT_FOUND';
      message = 'Запись не найдена';
    } else if (error?.code === 'P2034') {
      status = 409;
      code = 'RECORD_CONFLICT';
      message = 'Данные изменились. Обновите страницу и повторите';
    } else
      console.error(JSON.stringify({ requestId: req.requestId, code, errorType: error?.constructor?.name }));
    res.status(status).json({ code, message, fieldErrors, requestId: req.requestId });
  }
}
