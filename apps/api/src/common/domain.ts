import Decimal from 'decimal.js';
import type { EventInput } from '@carhistory/validation';
export function serviceTotal(input: Pick<EventInput, 'laborCost' | 'extraCost' | 'parts'>) {
  return input.parts
    .reduce(
      (sum, p) => sum.plus(new Decimal(p.quantity).times(p.unitPrice)),
      new Decimal(input.laborCost).plus(input.extraCost),
    )
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toFixed(2);
}
export function mileageConflict(value: number, previous?: number | null, next?: number | null) {
  return (previous != null && value < previous) || (next != null && value > next);
}
export function maskVin(vin: string | null) {
  return vin ? `${vin.slice(0, 6)}••••••${vin.slice(-5)}` : null;
}
export function reminderState(
  r: { targetDate: Date | null; targetKm: number | null; soonDays: number; soonKm: number },
  km: number | null,
  now = new Date(),
) {
  const days =
    r.targetDate === null
      ? Infinity
      : Math.ceil(
          (r.targetDate.getTime() - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) /
            86400000,
        );
  const distance = r.targetKm === null || km === null ? Infinity : r.targetKm - km;
  return days <= 0 || distance <= 0
    ? 'overdue'
    : days <= r.soonDays || distance <= r.soonKm
      ? 'soon'
      : 'upcoming';
}
export function addMonths(date: Date, months: number) {
  const d = new Date(date),
    original = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(original, last));
  return d;
}
