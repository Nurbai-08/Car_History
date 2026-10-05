import { z } from 'zod';
export const currencies = ['KGS', 'KZT', 'USD', 'EUR'] as const;
export const kinds = ['maintenance', 'repair', 'expense', 'mileage', 'accident', 'document'] as const;
export const categories = [
  'maintenance',
  'repair',
  'fuel',
  'insurance',
  'tax',
  'tires',
  'wash',
  'parking',
  'parts',
  'tuning',
  'fines',
  'other',
] as const;
export const currency = z.enum(currencies);
export const email = z.string().trim().toLowerCase().email().max(254);
export const password = z.string().min(8, 'Минимум 8 символов').max(128);
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Укажите дату')
  .refine((v) => !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Некорректная дата');
export const money = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, 'Сумма должна быть неотрицательной, до 2 знаков после запятой');
const text = z.string().trim().max(5000);
const optionalText = z.string().trim().max(500).optional();
export const registerSchema = z
  .object({ firstName: z.string().trim().min(1).max(80), email, password })
  .strict();
export const loginSchema = z.object({ email, password: z.string().max(128) }).strict();
export const carSchema = z
  .object({
    brand: z.string().trim().min(1).max(80),
    model: z.string().trim().min(1).max(100),
    year: z
      .number()
      .int()
      .min(1900)
      .max(new Date().getFullYear() + 1),
    vin: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-HJ-NPR-Z0-9]{17}$/, 'VIN: 17 символов без I, O, Q')
      .or(z.literal(''))
      .optional(),
    licensePlate: optionalText,
    generation: optionalText,
    engineType: optionalText,
    engineVolume: z
      .string()
      .regex(/^\d{1,2}(\.\d)?$/)
      .refine((v) => Number(v) > 0)
      .optional(),
    horsepower: z.number().int().positive().optional(),
    transmission: optionalText,
    drivetrain: optionalText,
    color: optionalText,
    note: optionalText,
    odometerKm: z.number().int().min(0).max(10000000),
    date,
    currency,
    purchaseDate: date.optional(),
    purchasePrice: money.optional(),
  })
  .strict();
export const partSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    brand: z.string().max(100).default(''),
    article: z.string().max(100).default(''),
    quantity: z
      .string()
      .regex(/^\d{1,7}(\.\d{1,3})?$/)
      .refine((v) => Number(v) > 0),
    unit: z.string().max(20).default('шт'),
    unitPrice: money,
    position: optionalText,
    warrantyUntil: date.optional(),
    warrantyKm: z.number().int().nonnegative().optional(),
  })
  .strict();
export const eventSchema = z
  .object({
    kind: z.enum(kinds),
    title: z.string().trim().min(1, 'Введите название').max(200),
    description: text.default(''),
    date,
    odometerKm: z.number().int().nonnegative().max(10000000).optional(),
    currency,
    laborCost: money.default('0'),
    extraCost: money.default('0'),
    parts: z.array(partSchema).max(100).default([]),
    serviceCenterId: z.string().uuid().optional(),
    fileIds: z.array(z.string().uuid()).max(10).default([]),
    relatedEventId: z.string().uuid().optional(),
    fileStages: z.record(z.string().uuid(), z.enum(["document", "before", "after"])).default({}),
    amount: money.default('0'),
    category: z.enum(categories).default('other'),
    reason: text.optional(),
    confirmed: z.boolean().default(false),
    changeType: z.enum(['reading', 'replacement', 'correction']).default('reading'),
    severity: z.enum(['minor', 'moderate', 'severe']).default('minor'),
    zones: z.array(z.string().max(100)).max(20).default([]),
    insuranceCase: z.boolean().default(false),
    estimatedDamage: money.default('0'),
    documentType: z
      .enum(['insurance', 'inspection', 'receipt', 'service', 'warranty', 'contract', 'other'])
      .default('other'),
    expiresAt: date.optional(),
    transferAllowed: z.boolean().default(false),
    nextKm: z.number().int().positive().optional(),
    nextMonths: z.number().int().positive().max(120).optional(),
    version: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((v, c) => {
    if (['maintenance', 'repair', 'mileage'].includes(v.kind) && v.odometerKm === undefined)
      c.addIssue({ code: 'custom', path: ['odometerKm'], message: 'Укажите одометр' });
    if (v.changeType !== 'reading' && (!v.confirmed || !v.reason?.trim()))
      c.addIssue({ code: 'custom', path: ['reason'], message: 'Подтвердите изменение и укажите причину' });
  });
export const reminderSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: text.default(''),
    targetDate: date.optional(),
    targetKm: z.number().int().nonnegative().optional(),
    repeatKm: z.number().int().positive().optional(),
    repeatMonths: z.number().int().positive().max(120).optional(),
    soonDays: z.number().int().min(0).max(365).default(30),
    soonKm: z.number().int().min(0).max(50000).default(1000),
  })
  .strict()
  .refine((v) => v.targetDate !== undefined || v.targetKm !== undefined, 'Укажите дату или пробег');
export const reportSettingsSchema = z
  .object({
    maintenance: z.boolean().default(true),
    repair: z.boolean().default(true),
    mileage: z.boolean().default(true),
    parts: z.boolean().default(true),
    accident: z.boolean().default(false),
    expense: z.boolean().default(false),
    document: z.boolean().default(false),
    licensePlate: z.boolean().default(false),
    eventIds: z.array(z.string().uuid()).max(2000).optional(),
    fileIds: z.array(z.string().uuid()).max(100).default([]),
  })
  .strict();
export const reportSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    expiresAt: z.string().datetime().optional(),
    settings: reportSettingsSchema,
  })
  .strict();
export type EventInput = z.infer<typeof eventSchema>;
export type CarInput = z.infer<typeof carSchema>;
export type ReportSettings = z.infer<typeof reportSettingsSchema>;
