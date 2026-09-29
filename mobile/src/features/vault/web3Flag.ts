/**
 * Feature-flag seam for the web3 vault/wallet UI (iOS reference: `feat/web3-version`, see
 * `docs/web3/rn-ui-parity-inventory.md`). Nothing under `src/features/vault/` is built by this
 * task — this module only decides whether a later crew's screens would be reachable.
 *
 * Default: OFF for the `prod` build variant, ON for `local`/`dev`. `prod` never honours the dev
 * override below, so a stray persisted value can't turn the feature on in a build real users
 * install.
 *
 * TODO(web3): once the server exposes a per-user eligibility field, gate on that here instead of
 * (or in addition to) the variant default. Geo-gating (Vietnam vs. international, per
 * `project_develop_is_base_rn_mobile` memory) is an open operator decision — do not implement
 * geo logic ahead of that call.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { env, type AppVariant } from '@/lib/env';
import { zustandMMKVStorage } from '@/offline/mmkv';

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
 * `expo-constants`.
 */
export function resolveWeb3Enabled(variant: AppVariant, override: boolean | null): boolean {
  if (variant === 'prod') return false;
  return override ?? true;
}

/** Whether the web3 vault/wallet UI should be shown on this device. */
export function useWeb3Enabled(): boolean {
  const override = useWeb3FlagStore((s) => s.override);
  return resolveWeb3Enabled(env.variant, override);
}

/** Non-hook read of the same flag, for code that lives outside React (the realtime layer). */
export function isWeb3Enabled(): boolean {
  return resolveWeb3Enabled(env.variant, useWeb3FlagStore.getState().override);
}
