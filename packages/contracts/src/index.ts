export type Currency = 'KGS' | 'KZT' | 'USD' | 'EUR';
export interface User {
  avatarFileId?: string | null;
  id: string;
  firstName: string;
  email: string;
  emailVerified: boolean;
  currency: Currency;
  timezone: string;
  emailNotifications: boolean;
}
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
export interface Car {
  id: string;
  brand: string;
  model: string;
  year: number;
  vin: string | null;
  licensePlate?: string;
  engineType?: string;
  engineVolume?: string;
  horsepower?: number;
  transmission?: string;
  drivetrain?: string;
  color?: string;
  currency: Currency;
  demo: boolean;
  archived: boolean;
  version: number;
  latestMileage: { odometerKm: number; date: string } | null;
  photos: { id: string; position: number }[];
  lastEvent: { title: string; date: string } | null;
}
export interface HistoryEvent {
  id: string;
  carId: string;
  kind: string;
  title: string;
  description: string;
  date: string;
  odometerKm: number | null;
  laborCost: string;
  extraCost: string;
  totalCost: string;
  currency: Currency;
  data: Record<string, any>;
  version: number;
  transferAllowed: boolean;
  parts: any[];
  files: { id: string; name: string; mime: string; size: number }[];
  serviceCenter: { id: string; name: string } | null;
}
export interface ApiError {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
  requestId: string;
}
