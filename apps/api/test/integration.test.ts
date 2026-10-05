import 'reflect-metadata';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { checkReminders } from '../src/modules/notifications';
import { bootstrap } from '../src/main';
let app: any, db: PrismaClient;
const origin = 'http://localhost:5173',
  base = 'http://127.0.0.1:3102/api/v1';
let a: any, b: any, car: any, event: any, report: any;
const pwd = 'IntegrationTest123!';
async function req(path: string, method = 'GET', body?: any, auth?: any, extra: Record<string, string> = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Origin: origin,
      'X-CSRF': '1',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(auth?.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {}),
      ...extra,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function emailToken(address: string, purpose: string) {
  const user = await db.user.findUniqueOrThrow({ where: { email: address } });
  const token = await db.authToken.findFirstOrThrow({ where: { userId: user.id, purpose, usedAt: null } });
  const outbox = await db.outbox.findMany({ where: { kind: 'email' }, orderBy: { createdAt: 'desc' } });
  const entry = outbox.find(
    (o) =>
      (o.payload as any).to === address &&
      (o.payload as any).text?.includes(purpose === 'reset' ? 'reset-password' : 'verify-email'),
  );
  assert.ok(token);
  return (entry!.payload as any).text.split('token=')[1];
}
before(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith('_test'))
    throw new Error('Set TEST_DATABASE_URL to a dedicated database ending _test');
  process.env.DATABASE_URL = url;
  process.env.PORT = '3102';
  process.env.FRONTEND_URL = origin;
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], { stdio: 'pipe', env: process.env });
  db = new PrismaClient();
  const tables = await db.$queryRaw<
    { tablename: string }[]
  >`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  for (const t of tables) await db.$executeRawUnsafe(`TRUNCATE TABLE "${t.tablename}" CASCADE`);
  app = await bootstrap();
});
after(async () => {
  await app?.close();
  await db?.$disconnect();
});
test('Регистрация, подтверждение email и отсутствие хеша в ответе', async () => {
  const ra = await req('/auth/register', 'POST', {
    firstName: 'Owner A',
    email: ' A@integration.test ',
    password: pwd,
  });
  assert.equal(ra.status, 201);
  assert.ok(!JSON.stringify(ra.data).includes('passwordHash'));
  a = { ...ra.data, cookie: ra.cookie };
  const rb = await req('/auth/register', 'POST', {
    firstName: 'Owner B',
    email: 'b@integration.test',
    password: pwd,
  });
  assert.equal(rb.status, 201);
  b = { ...rb.data, cookie: rb.cookie };
  for (const addr of ['a@integration.test', 'b@integration.test'])
    assert.equal(
      (await req('/auth/verify-email', 'POST', { token: await emailToken(addr, 'verify') })).status,
      201,
    );
});
test('CSRF отклоняет запрос без Origin и защитного заголовка', async () => {
  const r = await fetch(base + '/auth/refresh', { method: 'POST', headers: { Cookie: a.cookie } });
  assert.equal(r.status, 403);
});
test('Refresh ротируется; повтор старого токена отзывает весь session family', async () => {
  const fresh = await req('/auth/refresh', 'POST', undefined, undefined, { Cookie: a.cookie });
  assert.equal(fresh.status, 201);
  assert.notEqual(fresh.cookie, a.cookie);
  const replay = await req('/auth/refresh', 'POST', undefined, undefined, { Cookie: a.cookie });
  assert.equal(replay.status, 401);
  assert.equal((await req('/cars', 'GET', undefined, fresh.data)).status, 401);
  const login = await req('/auth/login', 'POST', { email: 'a@integration.test', password: pwd });
  a = { ...login.data, cookie: login.cookie };
});
test('Создание машины атомарно создаёт владельца, пробег и аудит', async () => {
  const r = await req(
    '/cars',
    'POST',
    {
      brand: 'Test',
      model: 'Car',
      year: 2020,
      vin: 'ZZZTST12345678901',
      odometerKm: 1000,
      date: '2026-01-01',
      currency: 'KGS',
    },
    a,
  );
  assert.equal(r.status, 201);
  car = r.data;
  assert.equal(await db.owner.count({ where: { carId: car.id, endedAt: null } }), 1);
  assert.equal(await db.mileage.count({ where: { carId: car.id } }), 1);
  assert.equal(await db.audit.count({ where: { carId: car.id } }), 1);
});
test('Другой пользователь не получает автомобиль, настройки, историю и поиск', async () => {
  for (const path of [
    `/cars/${car.id}`,
    `/cars/${car.id}/history`,
    `/cars/${car.id}/public-reports`,
    `/cars/${car.id}/expenses/stats`,
  ])
    assert.equal((await req(path, 'GET', undefined, b)).status, 404);
  assert.deepEqual((await req('/search?q=Test', 'GET', undefined, b)).data, {
    cars: [],
    events: [],
    parts: [],
  });
});
const service = {
  kind: 'maintenance',
  title: 'Oil service',
  date: '2026-03-01',
  odometerKm: 3000,
  currency: 'KGS',
  laborCost: '1500',
  parts: [
    { name: 'Oil', quantity: '6', unitPrice: '1400' },
    { name: 'Filter', quantity: '1', unitPrice: '1800' },
  ],
  nextKm: 5000,
  nextMonths: 6,
};
test('Параллельные запросы ТО с одним ключом дают ровно одну работу, расход и одометр', async () => {
  const values = await Promise.all([
    req(`/cars/${car.id}/maintenance`, 'POST', service, a, { 'Idempotency-Key': 'integration-same-request' }),
    req(`/cars/${car.id}/maintenance`, 'POST', service, a, { 'Idempotency-Key': 'integration-same-request' }),
  ]);
  assert.equal(values[0].status, 201);
  assert.equal(values[1].status, 201);
  assert.equal(values[0].data.id, values[1].data.id);
  event = values[0].data;
  assert.equal(event.totalCost, '11700');
  assert.equal(await db.event.count({ where: { carId: car.id } }), 1);
  assert.equal(await db.expense.count({ where: { eventId: event.id } }), 1);
  assert.equal(await db.mileage.count({ where: { eventId: event.id } }), 1);
  assert.equal((await req(`/cars/${car.id}/history`, 'GET', undefined, a)).data.items.length, 1);
  assert.equal((await req(`/events/${event.id}`, 'GET', undefined, b)).status, 404);
});
test('Idempotency key нельзя повторить с другим телом', async () => {
  assert.equal(
    (
      await req(`/cars/${car.id}/maintenance`, 'POST', { ...service, title: 'Different' }, a, {
        'Idempotency-Key': 'integration-same-request',
      })
    ).status,
    409,
  );
});
test('Ошибка внутри транзакции не оставляет работу, расход, одометр или аудит', async () => {
  const before = await db.event.count();
  const count = await db.audit.count();
  const r = await req(
    `/cars/${car.id}/maintenance`,
    'POST',
    {
      ...service,
      title: 'Overflow rollback',
      parts: [{ name: 'Overflow', quantity: '9999999.999', unitPrice: '999999999999.99' }],
    },
    a,
    { 'Idempotency-Key': 'integration-rollback' },
  );
  assert.equal(r.status, 500);
  assert.equal(await db.event.count(), before);
  assert.equal(await db.audit.count(), count);
});
test('Старое ТО не заменяет более поздний одометр; отклонение требует причины', async () => {
  const old = await req(
    `/cars/${car.id}/events`,
    'POST',
    { kind: 'mileage', title: 'Historic reading', date: '2026-02-01', odometerKm: 2000, currency: 'KGS' },
    a,
  );
  assert.equal(old.status, 201);
  assert.equal((await req(`/cars/${car.id}`, 'GET', undefined, a)).data.latestMileage.odometerKm, 3000);
  const bad = await req(
    `/cars/${car.id}/events`,
    'POST',
    { kind: 'mileage', title: 'Anomaly', date: '2026-04-01', odometerKm: 100, currency: 'KGS' },
    a,
  );
  assert.equal(bad.status, 409);
  assert.equal(bad.data.code, 'MILEAGE_CONFIRMATION_REQUIRED');
});
test('Редактирование ТО пересчитывает единственный расход; старая версия отклоняется', async () => {
  const edit = await req(
    `/events/${event.id}`,
    'PATCH',
    { ...service, laborCost: '2500', version: event.version },
    a,
  );
  assert.equal(edit.status, 200);
  event = edit.data;
  assert.equal(event.totalCost, '12700');
  assert.equal(
    (await db.expense.findUniqueOrThrow({ where: { eventId: event.id } })).amount.toString(),
    '12700',
  );
  assert.equal((await req(`/events/${event.id}`, 'PATCH', { ...service, version: 1 }, a)).status, 409);
});
test('Разные валюты сохраняют отдельные агрегаты', async () => {
  assert.equal(
    (
      await req(
        `/cars/${car.id}/events`,
        'POST',
        { kind: 'expense', title: 'USD cost', date: '2026-04-01', currency: 'USD', amount: '25.50' },
        a,
      )
    ).status,
    201,
  );
  const totals = (await req(`/cars/${car.id}/expenses/stats`, 'GET', undefined, a)).data.totals;
  assert.equal(totals.find((t: any) => t.currency === 'KGS').amount, '12700.00');
  assert.equal(totals.find((t: any) => t.currency === 'USD').amount, '25.50');
});
test('Отчёт использует allowlist и скрытые категории не объявляет отсутствующими', async () => {
  const r = await req(`/cars/${car.id}/public-reports`, 'POST', { title: 'Buyer report', settings: {} }, a);
  assert.equal(r.status, 201);
  report = r.data;
  const pub = await req(`/public/reports/${report.token}`);
  assert.equal(pub.status, 200);
  const serialized = JSON.stringify(pub.data);
  for (const secret of [
    'passwordHash',
    'userId',
    'createdBy',
    'objectKey',
    'a@integration.test',
    'ZZZTST12345678901',
  ])
    assert.ok(!serialized.includes(secret));
  assert.ok(pub.data.excluded.includes('accident'));
  assert.ok(pub.data.excluded.includes('expense'));
  assert.ok(!('totalCost' in pub.data.events[0]));
  assert.equal(pub.data.events.find((e: any) => e.id === event.id).title, 'Oil service');
});
test('Редактирование отмечено, снимок неизменен, публикация создаёт новую версию', async () => {
  const edit = await req(
    `/events/${event.id}`,
    'PATCH',
    { ...service, title: 'Updated oil service', laborCost: '2500', version: event.version },
    a,
  );
  assert.equal(edit.status, 200);
  event = edit.data;
  let pub = (await req(`/public/reports/${report.token}`)).data;
  assert.equal(pub.hasChanges, true);
  assert.equal(pub.events.find((e: any) => e.id === event.id).title, 'Oil service');
  assert.equal((await req(`/public-reports/${report.id}/publish`, 'POST', undefined, a)).status, 201);
  pub = (await req(`/public/reports/${report.token}`)).data;
  assert.equal(pub.version, 2);
  assert.equal(pub.events.find((e: any) => e.id === event.id).title, 'Updated oil service');
  assert.ok(pub.changes.length);
});
test('Worker создаёт уведомление по любому условию и не дублирует его при повторе', async () => {
  const r = await req(
    `/cars/${car.id}/reminders`,
    'POST',
    { title: 'Past due', targetDate: '2000-01-01', targetKm: 999999 },
    a,
  );
  assert.equal(r.status, 201);
  await checkReminders(db);
  await checkReminders(db);
  assert.equal(await db.notification.count({ where: { reminderId: r.data.id } }), 1);
  assert.equal(
    (await req('/notifications', 'GET', undefined, a)).data.items.some((n: any) => n.title === 'Past due'),
    true,
  );
});
test('Upload проверяет сигнатуру и права; приватный файл можно явно опубликовать', async () => {
  const form = new FormData();
  form.append('carId', car.id);
  form.append('file', new Blob(['<svg onload="alert(1)"></svg>'], { type: 'image/png' }), 'fake.png');
  let response = await fetch(base + '/files', {
    method: 'POST',
    headers: { Origin: origin, 'X-CSRF': '1', Authorization: `Bearer ${a.accessToken}` },
    body: form,
  });
  assert.equal(response.status, 400);
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF6kAAAAASUVORK5CYII=',
    'base64',
  );
  const good = new FormData();
  good.append('carId', car.id);
  good.append('file', new Blob([png], { type: 'image/png' }), 'proof.png');
  response = await fetch(base + '/files', {
    method: 'POST',
    headers: { Origin: origin, 'X-CSRF': '1', Authorization: `Bearer ${a.accessToken}` },
    body: good,
  });
  assert.equal(response.status, 201);
  const file: any = await response.json();
  assert.equal((await req(`/files/${file.id}/download`, 'GET', undefined, b)).status, 404);
  assert.equal((await req(`/public/reports/${report.token}/files/${file.id}`)).status, 404);
  const document = await req(
    `/cars/${car.id}/events`,
    'POST',
    {
      kind: 'document',
      title: 'PRIVATE CONTRACT',
      description: 'PRIVATE ADDRESS',
      date: '2026-04-01',
      currency: 'KGS',
      fileIds: [file.id],
    },
    a,
  );
  assert.equal(document.status, 201);
  (globalThis as any).privateFile = file.id;
  (globalThis as any).privateDoc = document.data.id;
  const published = await req(
    `/cars/${car.id}/public-reports`,
    'POST',
    { title: 'Explicit document', settings: { document: true, fileIds: [file.id] } },
    a,
  );
  assert.equal(published.status, 201);
  assert.equal((await req(`/public/reports/${published.data.token}/files/${file.id}`)).status, 200);
  assert.equal((await req(`/files/${file.id}`, 'DELETE', undefined, a)).status, 409);
  await req(`/public-reports/${published.data.id}`, 'DELETE', undefined, a);
  assert.equal((await req(`/public/reports/${published.data.token}/files/${file.id}`)).status, 404);
});
test('Удаление ТО исключает производные данные и оставляет след в отчёте', async () => {
  assert.equal(
    (await req(`/events/${event.id}?version=${event.version}`, 'DELETE', undefined, a)).status,
    200,
  );
  const summary = (await req(`/cars/${car.id}/summary`, 'GET', undefined, a)).data;
  assert.ok(!summary.totals.some((t: any) => t.currency === 'KGS'));
  assert.equal(summary.latestMileage.odometerKm, 2000);
  const pub = (await req(`/public/reports/${report.token}`)).data;
  assert.ok(pub.changeNotices.some((c: any) => c.message.includes('удалена')));
  assert.ok(pub.events.some((e: any) => e.id === event.id));
});
test('Приглашение принимается один раз; предыдущий владелец и закрытые документы теряют доступ', async () => {
  const invited = await req(
    `/cars/${car.id}/ownership-invitations`,
    'POST',
    { email: 'b@integration.test' },
    a,
  );
  assert.equal(invited.status, 201);
  const mail = await db.outbox.findFirstOrThrow({
    where: { kind: 'email', payload: { path: ['subject'], equals: 'Передача автомобиля в CarHistory' } },
  });
  const token = (mail.payload as any).text.split('token=')[1];
  const results = await Promise.all([
    req('/ownership-invitations/accept', 'POST', { token }, b),
    req('/ownership-invitations/accept', 'POST', { token }, b),
  ]);
  assert.ok(results.every((r) => r.status === 201));
  assert.equal(await db.owner.count({ where: { carId: car.id, endedAt: null } }), 1);
  assert.equal((await req(`/cars/${car.id}`, 'GET', undefined, a)).status, 404);
  assert.equal((await req(`/cars/${car.id}`, 'GET', undefined, b)).status, 200);
  assert.equal(
    (await req(`/files/${(globalThis as any).privateFile}/download`, 'GET', undefined, b)).status,
    404,
  );
  assert.equal((await req(`/events/${(globalThis as any).privateDoc}`, 'GET', undefined, b)).status, 404);
  assert.equal((await req(`/public/reports/${report.token}`)).status, 404);
});
test('Архивирование отзывает отчёт; восстановление сохраняет владельца', async () => {
  const r = await req(`/cars/${car.id}/public-reports`, 'POST', { title: 'Current owner', settings: {} }, b);
  assert.equal(r.status, 201);
  await req(`/cars/${car.id}`, 'DELETE', undefined, b);
  assert.equal((await req(`/public/reports/${r.data.token}`)).status, 404);
  assert.equal(
    (
      await req(
        `/cars/${car.id}/events`,
        'POST',
        { kind: 'expense', title: 'No archive writes', date: '2026-05-01', currency: 'KGS', amount: '1' },
        b,
      )
    ).status,
    404,
  );
  assert.equal((await req(`/cars/${car.id}/restore`, 'POST', undefined, b)).status, 201);
  assert.equal(await db.owner.count({ where: { carId: car.id, endedAt: null } }), 1);
});
test('Reset одноразовый, отзывает сессии, истёкший токен не принимается', async () => {
  const forgot = await req('/auth/forgot-password', 'POST', { email: 'b@integration.test' });
  assert.equal(forgot.status, 201);
  const missing = await req('/auth/forgot-password', 'POST', { email: 'missing@integration.test' });
  assert.deepEqual(forgot.data, missing.data);
  const token = await emailToken('b@integration.test', 'reset');
  assert.equal(
    (await req('/auth/reset-password', 'POST', { token, password: 'ChangedPassword123!' })).status,
    201,
  );
  assert.equal((await req('/auth/reset-password', 'POST', { token, password: pwd })).status, 400);
  assert.equal((await req('/cars', 'GET', undefined, b)).status, 401);
  await req('/auth/forgot-password', 'POST', { email: 'b@integration.test' });
  const expired = await emailToken('b@integration.test', 'reset');
  await db.authToken.updateMany({
    where: { purpose: 'reset', usedAt: null },
    data: { expiresAt: new Date(0) },
  });
  assert.equal((await req('/auth/reset-password', 'POST', { token: expired, password: pwd })).status, 400);
});
test('Выход немедленно блокирует ранее выданный access token', async () => {
  const login = await req('/auth/login', 'POST', {
    email: 'b@integration.test',
    password: 'ChangedPassword123!',
  });
  assert.equal(login.status, 201);
  assert.equal(
    (await req('/auth/logout', 'POST', undefined, undefined, { Cookie: login.cookie! })).status,
    201,
  );
  assert.equal((await req('/cars', 'GET', undefined, login.data)).status, 401);
});
