import { PrismaClient } from '@prisma/client';
import { reminderState } from '../common/domain';
export async function checkReminders(db: PrismaClient) {
  let cursor: string | undefined;
  do {
    const batch = await db.reminder.findMany({
      where: { status: 'active', car: { deletedAt: null } },
      include: {
        car: {
          include: {
            owners: { where: { endedAt: null }, include: { user: true } },
            mileage: {
              where: { OR: [{ eventId: null }, { event: { deletedAt: null } }] },
              orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
              take: 1,
            },
          },
        },
      },
      orderBy: { id: 'asc' },
      take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const r of batch) {
      const owner = r.car.owners[0]?.user;
      if (!owner) continue;
      const replacement = await db.mileage.findFirst({
        where: {
          carId: r.carId,
          changeType: 'replacement',
          date: { gt: r.baselineDate ?? new Date(0) },
          event: { deletedAt: null },
        },
      });
      const state = reminderState(r, replacement ? null : (r.car.mileage[0]?.odometerKm ?? null));
      if (state === 'upcoming') continue;
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Car" WHERE id=${r.carId}::uuid FOR UPDATE`;
        const current = await tx.owner.findFirst({
          where: { carId: r.carId, userId: owner.id, endedAt: null, car: { deletedAt: null } },
        });
        const active = await tx.reminder.findFirst({
          where: { id: r.id, status: 'active', version: r.version },
        });
        if (!current || !active) return;
        const deliveryKey = `${owner.id}-${r.id}-${r.version}-${state}`;
        const count = await tx.notification.createMany({
          data: [
            {
              userId: owner.id,
              reminderId: r.id,
              carId: r.carId,
              title: r.title,
              body: state === 'overdue' ? 'Срок обслуживания наступил' : 'Обслуживание приближается',
              deliveryKey,
            },
          ],
          skipDuplicates: true,
        });
        if (count.count && owner.emailNotifications && owner.emailVerifiedAt)
          await tx.outbox.create({
            data: {
              kind: 'email',
              payload: {
                to: owner.email,
                subject: `CarHistory: ${r.title}`,
                text: `${state === 'overdue' ? 'Пора выполнить' : 'Приближается'}: ${r.title}. Откройте ${process.env.FRONTEND_URL}/cars/${r.carId}/reminders`,
              },
            },
          });
      });
    }
    cursor = batch.length === 100 ? batch.at(-1)!.id : undefined;
  } while (cursor);
}
