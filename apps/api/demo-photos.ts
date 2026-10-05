import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const db = new PrismaClient();
const s3 = new S3Client({
  region: 'us-east-1',
  endpoint: process.env.STORAGE_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY!,
    secretAccessKey: process.env.STORAGE_SECRET_KEY!,
  },
});
async function main() {
  if (process.env.NODE_ENV !== 'development') throw new Error('Development only');
  const cars = await db.car.findMany({
    where: { demo: true },
    include: { owners: { where: { endedAt: null } } },
  });
  for (const car of cars) {
    const name = car.brand === 'BMW' ? 'bmw' : 'toyota',
      bytes = await readFile(`demo-assets/${name}.jpg`),
      objectKey = `demo/${name}.jpg`;
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.STORAGE_BUCKET,
        Key: objectKey,
        Body: bytes,
        ContentType: 'image/jpeg',
      }),
    );
    await db.file.upsert({
      where: { objectKey },
      create: {
        userId: car.owners[0].userId,
        carId: car.id,
        objectKey,
        originalName: `Демонстрационное фото ${name}.jpg`,
        mime: 'image/jpeg',
        size: bytes.length,
        checksum: createHash('sha256').update(bytes).digest('hex'),
        status: 'ready',
        photoPosition: 0,
      },
      update: { status: 'ready', photoPosition: 0 },
    });
  }
  console.log('Demo photos stored');
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
