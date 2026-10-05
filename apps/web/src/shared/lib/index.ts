import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export const cn = (...v: ClassValue[]) => twMerge(clsx(v));
export const number = (v: number | string) => new Intl.NumberFormat('ru-RU').format(Number(v));
export const money = (v: number | string, currency = 'KGS') =>
  `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(v))} ${currency === 'KGS' ? 'сом' : currency}`;
export const date = (v: string | Date | null | undefined) =>
  v
    ? new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(v))
    : '—';
export const isoToday = () => new Date().toLocaleDateString('sv-SE');
export const labels: Record<string, string> = {
  maintenance: 'Обслуживание',
  repair: 'Ремонт',
  expense: 'Расход',
  mileage: 'Пробег',
  accident: 'ДТП',
  document: 'Документ',
  parts: 'Детали',
  licensePlate: 'Госномер',
  fuel: 'Топливо',
  insurance: 'Страхование',
  tax: 'Налоги',
  tires: 'Шины',
  wash: 'Мойка',
  parking: 'Парковка',
  tuning: 'Тюнинг',
  fines: 'Штрафы',
  other: 'Другое',
};
