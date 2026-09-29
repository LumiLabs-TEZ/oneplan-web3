/**
 * Feature-flag seam for the web3 vault/wallet UI (iOS reference: `feat/web3-version`, see
 * `docs/web3/rn-ui-parity-inventory.md`).
 *
 * The SERVER decides (`GET /web3/eligibility`): account-level surfaces (profile/settings wallet
 * entries, the launch welcome sheet, wallet routes) show iff the caller is `eligible` (non-VN
 * request IP, server web3 on + configured). Trip surfaces additionally require `trip.web3`. A
 * non-eligible member (e.g. Vietnamese, no VPN) sees a web3 trip as an ordinary trip: the server
 * 403s every web3 route for them, and the client never renders or calls them.
 * Loading / error / dark server ⇒ OFF (fail closed). `hasWeb3Trip` is informational only.
 *
 * Build-variant guard: `prod` is forced OFF for now, whatever the server says. The dev override can
 * only turn web3 OFF on `local`/`dev`; it can never force it ON against the server (there would be
 * nothing behind the screens — the vault endpoints 404 while the server is dark).
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { env, type AppVariant } from '@/lib/env';
import { useAuthStore } from '@/auth/authStore';
import { queryClient } from '@/api/queryClient';
import { keys } from '@/api/keys';
import { useTrip } from '@/features/trip/api/queries';
import { zustandMMKVStorage } from '@/offline/mmkv';

import { useWeb3Eligibility, type Web3EligibilityDto } from './api/eligibility';

export const WEB3_FLAG_STORAGE_KEY = 'oneplan.web3Flag';

interface Web3FlagState {
  /** Dev-only manual override; `null` = no override, fall back to the variant default. */
  override: boolean | null;
  setOverride: (override: boolean | null) => void;
}

export const useWeb3FlagStore = create<Web3FlagState>()(
  persist(
    (set) => ({
      override: null,
      setOverride: (override) => set({ override }),
    }),
    {
      name: WEB3_FLAG_STORAGE_KEY,
      storage: createJSONStorage(() => zustandMMKVStorage),
    },
  ),
);

/**
 * Pulled out of the hook so the prod fail-closed path is unit-testable without mocking
 * `expo-constants`. `eligibility` is `null`/`undefined` until the server has answered.
 */
export function resolveWeb3Enabled(
  variant: AppVariant,
  override: boolean | null,
  eligibility: Web3EligibilityDto | null | undefined,
): boolean {
  if (variant === 'prod') return false;
  if (override === false) return false;
  return eligibility?.eligible === true;
}

/**
 * Whether the web3 vault/wallet UI should be shown. Pass `tripId` from trip-scoped surfaces to
 * also require that trip to be a web3 trip (`trip.web3`, fixed at creation).
 */
export function useWeb3Enabled(tripId?: number): boolean {
  const override = useWeb3FlagStore((s) => s.override);
  const authed = useAuthStore((s) => s.status === 'authed');
  const eligibility = useWeb3Eligibility({ enabled: authed });
  const trip = useTrip(tripId);
  const account = resolveWeb3Enabled(env.variant, override, eligibility.data);
  if (tripId === undefined) return account;
  return account && trip.data?.web3 === true;
}

/** Non-hook read of the account-level flag, for code that lives outside React (the realtime layer). */
export function isWeb3Enabled(): boolean {
  return resolveWeb3Enabled(
    env.variant,
    useWeb3FlagStore.getState().override,
    queryClient.getQueryData<Web3EligibilityDto>(keys.web3Eligibility),
  );
}
