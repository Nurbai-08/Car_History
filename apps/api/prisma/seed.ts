import 'reflect-metadata';
import { hash, argon2id } from 'argon2';
import { Db } from '../src/common/core';
import { HistoryService, CarsController } from '../src/modules/history';
import { ReportsService } from '../src/modules/reports';
import { reportSettingsSchema } from '@carhistory/validation';
import { S3Client, HeadBucketCommand, CreateBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
const db = new Db();
async function main() {
  if (process.env.NODE_ENV !== 'development')
    throw new Error('Seed is allowed only with NODE_ENV=development');
  let user = await db.user.findUnique({ where: { email: 'owner@carhistory.test' } });
  if (user) {
    console.log('Demo account already exists; existing history preserved.');
    return;
  }
  user = await db.user.create({
    data: {
      email: 'owner@carhistory.test',
      firstName: 'Александр',
      passwordHash: await hash('CarHistory2026!', {
        type: argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      }),
      emailVerifiedAt: new Date(),
    },
  });
  const actor = { id: user.id, sid: crypto.randomUUID(), requestId: crypto.randomUUID() },
    history = new HistoryService(db),
    cars = new CarsController(db, history);
  const bmw = await cars.create(
    { actor },
    {
      brand: 'BMW',
      model: '540i',
      year: 2019,
      odometerKm: 128300,
      date: '2026-01-10',
      currency: 'KGS',
      engineType: 'Бензин · 3.0 л',
      transmission: 'Автомат',
      color: 'Серебристый',
      horsepower: 340,
    },
  );
  const toyota = await cars.create(
    { actor },
    {
      brand: 'Toyota',
      model: 'Camry',
      year: 2021,
      odometerKm: 52000,
      date: '2026-01-15',
      currency: 'KGS',
      engineType: 'Бензин · 2.5 л',
      transmission: 'Автомат',
      color: 'Белый',
      horsepower: 181,
    },
  );
  await db.car.updateMany({ where: { id: { in: [bmw.id, toyota.id] } }, data: { demo: true } });
  await history.save(
    actor,
    bmw.id,
    {
      kind: 'maintenance',
      title: 'Плановое обслуживание',
      description: 'Демонстрационная запись. Диагностика, проверка тормозной системы и ходовой части.',
      date: '2026-02-12',
      odometerKm: 132800,
      currency: 'KGS',
      laborCost: '6500',
      parts: [
        {
          name: 'Воздушный фильтр',
          brand: 'MANN',
          article: 'C 28 034',
          quantity: '1',
          unitPrice: '4200',
          position: 'Воздушный фильтр',
        },
      ],
    },
    'demo-bmw-service-1',
  );
  await history.save(
    actor,
    bmw.id,
    {
      kind: 'repair',
      title: 'Замена передних тормозных колодок',
      description: 'Демонстрационная запись. Передняя ось.',
      date: '2026-04-20',
      odometerKm: 134210,
      currency: 'KGS',
      laborCost: '3500',
      parts: [
        {
          name: 'Тормозные колодки',
          brand: 'Brembo',
          article: 'P 06 088',
          quantity: '1',
          unitPrice: '12500',
          position: 'Передние тормоза',
        },
      ],
    },
    'demo-bmw-repair-1',
  );
  await history.save(
    actor,
    bmw.id,
    {
      kind: 'maintenance',
      title: 'Замена моторного масла',
      description:
        'Демонстрационная запись. Масло двигателя и масляный фильтр. Следующая замена через 9 158 км или 12 месяцев.',
      date: '2026-06-18',
      odometerKm: 135842,
      currency: 'KGS',
      laborCost: '1500',
      parts: [
        {
          name: 'Моторное масло 5W-30',
          brand: 'BMW',
          quantity: '6',
          unit: 'л',
          unitPrice: '1400',
          position: 'Масло двигателя',
        },
        {
          name: 'Масляный фильтр',
          brand: 'MANN',
          article: 'HU 6014 z',
          quantity: '1',
          unitPrice: '1800',
          position: 'Масляный фильтр',
        },
      ],
      nextKm: 9158,
      nextMonths: 12,
    },
    'demo-bmw-oil-1',
  );
  await history.save(
    actor,
    bmw.id,
    {
      kind: 'accident',
      title: 'Повреждение заднего бампера',
      description: 'Демонстрация: царапина на парковке. Оценка ущерба не включена в расходы.',
      date: '2026-07-03',
      odometerKm: 136300,
      currency: 'KGS',
      severity: 'minor',
      zones: ['Задний бампер'],
      estimatedDamage: '12000',
    },
    'demo-bmw-accident',
  );
  await history.save(
    actor,
    bmw.id,
    {
      kind: 'expense',
      title: 'Страхование автомобиля',
      date: '2026-08-01',
      currency: 'KGS',
      amount: '9500',
      category: 'insurance',
    },
    'demo-bmw-insurance',
  );
  await history.save(
    actor,
    bmw.id,
    { kind: 'mileage', title: 'Показание одометра', date: '2026-10-01', odometerKm: 140421, currency: 'KGS' },
    'demo-bmw-mileage',
  );
  await history.save(
    actor,
    bmw.id,
    {
      kind: 'document',
      title: 'Демонстрационный страховой полис',
      description: 'Пример карточки документа. Не является действующим полисом.',
      date: '2026-08-01',
      expiresAt: '2026-10-20',
      documentType: 'insurance',
      currency: 'KGS',
    },
    'demo-bmw-document',
  );
  await history.save(
    actor,
    toyota.id,
    {
      kind: 'maintenance',
      title: 'Замена масла и фильтров',
      description: 'Демонстрационная запись.',
      date: '2026-08-15',
      odometerKm: 61000,
      currency: 'KGS',
      laborCost: '1200',
      parts: [
        { name: 'Моторное масло', quantity: '4.5', unit: 'л', unitPrice: '1200' },
        { name: 'Фильтр', quantity: '1', unitPrice: '1400' },
      ],
    },
    'demo-toyota-oil',
  );
  await history.save(
    actor,
    toyota.id,
    { kind: 'mileage', title: 'Показание одометра', date: '2026-09-25', odometerKm: 64280, currency: 'KGS' },
    'demo-toyota-mileage',
  );
  await db.reminder.create({
    data: {
      carId: toyota.id,
      title: 'Плановый техосмотр',
      targetDate: new Date('2026-10-12'),
      baselineDate: new Date('2026-09-25'),
    },
  });
  await db.serviceCenter.create({
    data: { userId: user.id, name: 'Демо Автосервис', note: 'Вымышленная СТО для демонстрации' },
  });
  // Local demo photos are optional; all car functionality works with the placeholder.
  try {
    const s3 = new S3Client({
      region: 'us-east-1',
      endpoint: process.env.STORAGE_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY!,
        secretAccessKey: process.env.STORAGE_SECRET_KEY!,
      },
    });
    try {
      await s3.send(new HeadBucketCommand({ Bucket: process.env.STORAGE_BUCKET }));
    } catch {
      await s3.send(new CreateBucketCommand({ Bucket: process.env.STORAGE_BUCKET }));
    }
    for (const [carId, name] of [
      [bmw.id, 'bmw'],
      [toyota.id, 'toyota'],
    ]) {
      let image: Buffer;
      try {
        image = await readFile(join(__dirname, `../demo-assets/${name}.jpg`));
      } catch {
        continue;
      }
      const objectKey = `demo/${name}.jpg`;
      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.STORAGE_BUCKET,
          Key: objectKey,
          Body: image,
          ContentType: 'image/jpeg',
        }),
      );
      await db.file.create({
        data: {
          carId,
          userId: user.id,
          objectKey,
          originalName: `Демо ${name}.jpg`,
          mime: 'image/jpeg',
          size: image.length,
          checksum: createHash('sha256').update(image).digest('hex'),
          status: 'ready',
          photoPosition: 0,
        },
      });
    }
  } catch {
    console.log('Optional demo photos skipped: start object storage and use the photo uploader.');
  }
  const reports = new ReportsService(db);
  await db.$transaction(async (tx) => {
    const r = await tx.report.create({
      data: {
        carId: bmw.id,
        createdBy: user!.id,
        title: 'Пример истории BMW 540i',
        token: 'demo_' + crypto.randomUUID().replaceAll('-', '') + '123456',
        settings: reportSettingsSchema.parse({}),
      },
    });
    await reports.publish(tx, actor, r);
  });
  console.log('Demo seed created. Login: owner@carhistory.test / CarHistory2026!');
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
