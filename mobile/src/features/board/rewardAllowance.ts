import { create } from 'zustand';
/** The API is authoritative; this only avoids offering a known exhausted reward again today. */
export const useRewardAllowance = create<{ day: string | null; remaining: number | null }>(() => ({
  day: null,
  remaining: null,
}));
export function recordRewardAllowance(remaining: number) {
  useRewardAllowance.setState({ day: new Date().toISOString().slice(0, 10), remaining });
}
export function resetRewardAllowance() {
  useRewardAllowance.setState({ day: null, remaining: null });
}
