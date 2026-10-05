import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export const useUI = create(
  persist<{ selectedCar: string | null; selectCar: (id: string) => void }>(
    (set) => ({ selectedCar: null, selectCar: (id) => set({ selectedCar: id }) }),
    { name: 'carhistory-ui', partialize: (s) => ({ selectedCar: s.selectedCar }) as any },
  ),
);
