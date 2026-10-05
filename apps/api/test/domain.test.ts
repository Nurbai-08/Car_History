import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, maskVin, mileageConflict, reminderState, serviceTotal } from '../src/common/domain';
import { carSchema, eventSchema } from '@carhistory/validation';
test('Стоимость деталей и труда вычисляется десятичной арифметикой', () => {
  assert.equal(
    serviceTotal({
      laborCost: '1500',
      extraCost: '0',
      parts: [
        { name: 'Масло', brand: '', article: '', quantity: '6', unit: 'л', unitPrice: '1400' },
        { name: 'Фильтр', brand: '', article: '', quantity: '1', unit: 'шт', unitPrice: '1800' },
      ],
    }),
    '11700.00',
  );
  assert.equal(
    serviceTotal({
      laborCost: '0.10',
      extraCost: '0.20',
      parts: [{ name: 'Жидкость', brand: '', article: '', quantity: '0.125', unit: 'л', unitPrice: '0.20' }],
    }),
    '0.33',
  );
});
test('Проверяются предыдущий и последующий одометры', () => {
  assert.equal(mileageConflict(900, 1000, 2000), true);
  assert.equal(mileageConflict(2100, 1000, 2000), true);
  assert.equal(mileageConflict(1500, 1000, 2000), false);
});
test('Напоминание срабатывает по любому из условий', () => {
  const r = { targetDate: new Date('2026-12-01'), targetKm: 10000, soonDays: 30, soonKm: 1000 };
  assert.equal(reminderState(r, 10001, new Date('2026-01-01')), 'overdue');
  assert.equal(reminderState(r, 100, new Date('2026-12-02')), 'overdue');
  assert.equal(reminderState(r, 9200, new Date('2026-01-01')), 'soon');
  assert.equal(reminderState(r, null, new Date('2026-01-01')), 'upcoming');
});
test('Интервал месяцев учитывает конец месяца', () =>
  assert.equal(addMonths(new Date('2026-01-31'), 1).toISOString().slice(0, 10), '2026-02-28'));
test('VIN маскируется без утечки середины', () => {
  assert.equal(maskVin('ZZZTST12345678901'), 'ZZZTST••••••78901');
  assert.equal(maskVin(null), null);
});
test('Валидация не принимает неверный VIN, даты и неизвестные поля', () => {
  const c = { brand: 'Test', model: 'Car', year: 2026, date: '2026-01-01', odometerKm: 0, currency: 'KGS' };
  assert.equal(carSchema.safeParse({ ...c, vin: 'IOQ12345678901234' }).success, false);
  assert.equal(carSchema.safeParse({ ...c, date: '2026-02-31' }).success, false);
  assert.equal(carSchema.safeParse({ ...c, ownerId: 'injected' }).success, false);
  assert.equal(
    eventSchema.safeParse({
      kind: 'mileage',
      title: 'Test',
      date: '2026-01-01',
      currency: 'KGS',
      odometerKm: 10,
      changeType: 'replacement',
    }).success,
    false,
  );
});
