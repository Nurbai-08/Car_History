import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import { createTransport } from 'nodemailer';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { storage } from './modules/files';
import { checkReminders } from './modules/notifications';
const db = new PrismaClient();
const redis = new URL(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
const connection = {
  host: redis.hostname,
  port: Number(redis.port || 6379),
  username: redis.username || undefined,
  password: redis.password || undefined,
  ...(redis.protocol === 'rediss:' ? { tls: {} } : {}),
};
const queue = new Queue('carhistory', { connection });
const transport = createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 1025),
  secure: process.env.SMTP_SECURE === 'true',
  ...(process.env.SMTP_USER
    ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } }
    : {}),
});
const worker = new Worker(
  'carhistory',
  async (job) => {
    if (job.name === 'tick' || job.name === 'reminders') {
      await checkReminders(db);
      return;
    }
    if (job.name === 'outbox') {
      const item = await db.outbox.findUnique({ where: { id: job.data.id } });
      if (!item || item.sentAt) return;
      const payload: any = item.payload;
      if (item.kind === 'email')
        await transport.sendMail({
          from: process.env.MAIL_FROM,
          to: payload.to,
          subject: payload.subject,
          text: payload.text,
          messageId: `<${item.id}@carhistory.local>`,
        });
      if (item.kind === 'reminders') await checkReminders(db);
      if (item.kind === 'delete-file')
        await storage().send(
          new DeleteObjectCommand({ Bucket: process.env.STORAGE_BUCKET, Key: payload.key }),
        );
      await db.outbox.update({
        where: { id: item.id },
        data: { sentAt: new Date(), ...(item.kind === 'email' ? { payload: { delivered: true } } : {}) },
      });
    }
    if (job.name === 'cleanup') {
      const stale = await db.file.findMany({
        where: { status: { in: ['pending', 'failed'] }, createdAt: { lt: new Date(Date.now() - 3600000) } },
        take: 100,
      });
      for (const f of stale) {
        await storage().send(
          new DeleteObjectCommand({ Bucket: process.env.STORAGE_BUCKET, Key: f.objectKey }),
        );
        await db.file.update({ where: { id: f.id }, data: { status: 'deleted' } });
      }
    }
  },
  { connection, concurrency: 1 },
);
worker.on('failed', (job) =>
  console.error(JSON.stringify({ code: 'JOB_FAILED', id: job?.id, name: job?.name })),
);
let pumping = false;
const pump = async () => {
  if (pumping) return;
  pumping = true;
  try {
    const rows = await db.outbox.findMany({
      where: { sentAt: null },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });
    for (const item of rows)
      await queue.add(
        'outbox',
        { id: item.id },
        {
          jobId: item.id,
          attempts: 8,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 1000,
        },
      );
  } catch {
    console.error('OUTBOX_PUMP_FAILED');
  } finally {
    pumping = false;
  }
};
async function main() {
  await queue.upsertJobScheduler('reminder-tick', { every: 60000 }, { name: 'tick', data: {} });
  await queue.upsertJobScheduler('file-cleanup', { every: 3600000 }, { name: 'cleanup', data: {} });
  await pump();
  const timer = setInterval(pump, 2000);
  console.log('CarHistory worker ready');
  const close = async () => {
    clearInterval(timer);
    await worker.close();
    await queue.close();
    await db.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', close);
  process.on('SIGINT', close);
}
main().catch(() => {
  console.error('WORKER_START_FAILED');
  process.exit(1);
});
