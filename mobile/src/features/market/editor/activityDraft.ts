import { create } from 'zustand';
import type { Activity } from './state';
type Result = { kind: 'save'; activity: Activity } | { kind: 'delete'; key: string };
/** What the activity screen needs from the listing editor besides the activity itself. */
export interface ActivityDraftOptions {
  /** Listing duration — the day chips offered by the activity screen. */
  dayCount: number;
  /** Opened from "New Plan" (no trash button) rather than an existing card. */
  isNew: boolean;
}
interface State extends ActivityDraftOptions {
  sessionId: string | null;
  original: Activity | null;
  result: Result | null;
  begin: (sessionId: string, activity: Activity, options?: Partial<ActivityDraftOptions>) => void;
  finish: (result: Result) => void;
  consume: (sessionId: string) => Result | null;
  clear: (sessionId: string) => void;
}
export const useActivityDraft = create<State>((set, get) => ({
  sessionId: null,
  original: null,
  result: null,
  dayCount: 1,
  isNew: true,
  begin: (sessionId, activity, options) =>
    set({
      sessionId,
      original: { ...activity, imageUrls: [...(activity.imageUrls ?? [])] },
      result: null,
      dayCount: Math.max(1, options?.dayCount ?? 1),
      isNew: options?.isNew ?? true,
    }),
  finish: (result) => set({ result }),
  clear: (sessionId) => {
    if (get().sessionId === sessionId) set({ sessionId: null, original: null, result: null });
  },
  consume: (sessionId) => {
    if (get().sessionId !== sessionId) return null;
    const result = get().result;
    if (result) set({ result: null, original: null, sessionId: null });
    return result;
  },
}));
