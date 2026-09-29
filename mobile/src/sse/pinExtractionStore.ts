import { create } from 'zustand';
import type { CreditError, ExtractedPin, ExtractionSession } from '@/features/board/types';

export function mergePins(previous: ExtractedPin[], incoming: ExtractedPin[]): ExtractedPin[] {
  const pins = new Map(previous.map((pin) => [pin.index, pin]));
  for (const pin of incoming) {
    const old = pins.get(pin.index);
    pins.set(pin.index, {
      ...old,
      ...pin,
      ...(old?.latitude !== undefined && old.longitude !== undefined
        ? { latitude: old.latitude, longitude: old.longitude, address: old.address ?? pin.address }
        : {}),
    });
  }
  return [...pins.values()].sort((a, b) => a.index - b.index);
}
interface ExtractionState {
  session: ExtractionSession | null;
  selected: number[];
  connecting: boolean;
  error: string | null;
  creditError: CreditError | null;
  snapshot: (session: ExtractionSession | null) => void;
  toggle: (index: number) => void;
  reset: () => void;
}
const initial = { session: null, selected: [], connecting: false, error: null, creditError: null };
export const usePinExtractionStore = create<ExtractionState>()((set) => ({
  ...initial,
  snapshot: (session) =>
    set((state) => {
      if (!session) return initial;
      const same = state.session?.id === session.id;
      const previous = same ? state.session!.pins : [];
      const newIndexes = session.pins
        .filter((pin) => !previous.some((old) => old.index === pin.index))
        .map((pin) => pin.index);
      return {
        session: { ...session, pins: mergePins(previous, session.pins) },
        selected: [...(same ? state.selected : []), ...newIndexes],
        error: null,
      };
    }),
  toggle: (index) =>
    set((state) => ({
      selected: state.selected.includes(index)
        ? state.selected.filter((i) => i !== index)
        : [...state.selected, index],
    })),
  reset: () => set(initial),
}));
