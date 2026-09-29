import { create } from 'zustand';

import { tokenStore } from './tokenStore';

/**
 * `anon`    – no tokens (never signed in, or signed out on purpose)
 * `authed`  – tokens present
 * `expired` – tokens were rejected/refresh failed; UI shows "session expired"
 *             and routes to login (the iOS `authSessionExpired` notification).
 */
export type AuthStatus = 'anon' | 'authed' | 'expired';
export type SignOutReason = 'user' | 'expired';

interface AuthState {
  status: AuthStatus;
  /** Set once `tokenStore.hydrate()` has resolved; gate the router on it. */
  ready: boolean;
  setReady: () => void;
  markAuthed: () => void;
  signOut: (reason: SignOutReason) => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  status: tokenStore.get() ? 'authed' : 'anon',
  ready: false,
  setReady: () => set({ ready: true, status: tokenStore.get() ? 'authed' : 'anon' }),
  markAuthed: () => set({ status: 'authed' }),
  signOut: (reason) => {
    void tokenStore.clear();
    set({ status: reason === 'expired' ? 'expired' : 'anon' });
  },
}));

/** Non-hook access for the API middleware. */
export const authStore = {
  signOut: (reason: SignOutReason) => useAuthStore.getState().signOut(reason),
  markAuthed: () => useAuthStore.getState().markAuthed(),
};
