/**
 * Draft state for the "New trip" flow — port of the `@State` vars in `CreateTripView.swift`.
 * Not persisted: the flow is a single in-memory session (closing the modal/app abandons the
 * draft, same as the SwiftUI sheet being dismissed).
 */
import { create } from 'zustand';

import type { components } from '@/api/schema';

import { type DateRange } from './helpers/dateRange';

type LocationSearchResultDto = components['schemas']['LocationSearchResultDto'];

interface CreateTripState {
  name: string;
  location: LocationSearchResultDto | null;
  range: DateRange;
  /** True once the duration sheet has been confirmed at least once (`CreateTripView.swift:310`). */
  hasSelectedDuration: boolean;
  coverUri: string | null;
  /** Friends tapped `Invite` on — invited right after the trip is created (`CreateTripView.swift:377`). */
  selectedFriendIds: number[];
  setName: (name: string) => void;
  setLocation: (location: LocationSearchResultDto | null) => void;
  setRange: (range: DateRange) => void;
  setCoverUri: (coverUri: string | null) => void;
  addFriend: (userId: number) => void;
  reset: () => void;
}

const initialDraft = {
  name: '',
  location: null as LocationSearchResultDto | null,
  range: { start: null, end: null } as DateRange,
  hasSelectedDuration: false,
  coverUri: null as string | null,
  selectedFriendIds: [] as number[],
};

export const useCreateTripStore = create<CreateTripState>()((set) => ({
  ...initialDraft,
  setName: (name) => set({ name }),
  setLocation: (location) => set({ location }),
  setRange: (range) => set({ range, hasSelectedDuration: true }),
  setCoverUri: (coverUri) => set({ coverUri }),
  addFriend: (userId) =>
    set((s) =>
      s.selectedFriendIds.includes(userId)
        ? s
        : { selectedFriendIds: [...s.selectedFriendIds, userId] },
    ),
  reset: () => set({ ...initialDraft }),
}));

/** Non-hook access for imperative call sites (route handlers, submit actions). */
export const createTripStore = {
  getState: () => useCreateTripStore.getState(),
  setName: (name: string) => useCreateTripStore.getState().setName(name),
  setLocation: (location: LocationSearchResultDto | null) =>
    useCreateTripStore.getState().setLocation(location),
  setRange: (range: DateRange) => useCreateTripStore.getState().setRange(range),
  setCoverUri: (coverUri: string | null) => useCreateTripStore.getState().setCoverUri(coverUri),
  addFriend: (userId: number) => useCreateTripStore.getState().addFriend(userId),
  reset: () => useCreateTripStore.getState().reset(),
};
