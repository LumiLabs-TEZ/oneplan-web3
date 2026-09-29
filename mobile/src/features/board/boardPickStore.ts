import { create } from 'zustand';
import type { PinInput } from './types';
/** Bulk selections are separate from the single-place handoff and scoped to their destination. */
export const useBoardPickStore = create<{ result: { tripId: number; pins: PinInput[] } | null }>(
  () => ({ result: null }),
);
export const boardPickStore = {
  set: (tripId: number, pins: PinInput[]) =>
    useBoardPickStore.setState({ result: { tripId, pins } }),
  consume: (tripId: number): PinInput[] | null => {
    const result = useBoardPickStore.getState().result;
    useBoardPickStore.setState({ result: null });
    return result?.tripId === tripId ? result.pins : null;
  },
  reset: () => useBoardPickStore.setState({ result: null }),
};
