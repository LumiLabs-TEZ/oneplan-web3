/**
 * Free-trial promo eligibility — port of `OnePlanApp.presentFreeTrialIfEligible` (:154-163,
 * :463-473) + `StoreManager.isEligibleForFreeTrial()` (:245-254) + the persisted promo window
 * (`OnboardingManager.trialOfferDeadline`). `false` for anyone already Pro, or while the
 * subscription status hasn't loaded yet — the root-modal presenter never pre-empts the
 * friend/invite modals on a guess.
 *
 * Two module-level, once-per-launch flags:
 *  - `evaluated` — the store eligibility check itself runs at most once per app session; a
 *    re-render (e.g. the countdown ticking on the free-trial screen itself) must not re-hit the
 *    store.
 *  - `shownThisSession` — iOS only ever offers the promo once per launch
 *    (`presentFreeTrialIfEligible`). `markFreeTrialShown()` is called by the presenter the instant
 *    it decides to push `/free-trial`; checking it at the TOP of the render body (not just inside
 *    the effect) means the very next render after a dismissal — driven by the root-modal store
 *    going back to `active: null`, not by any of this hook's own dependencies changing — already
 *    returns `false`. Without that render-time check the presenter would re-push `/free-trial`
 *    immediately after every dismissal (the effect's dependency array never changes just because
 *    the modal closed).
 *
 * The window's own expiry is handled with a one-shot `setTimeout` scheduled for the exact
 * `deadline` (rather than polling `Date.now()` on every render) — the React Compiler forbids
 * calling impure functions like `Date.now()` during render, so this can only be recomputed inside
 * an effect.
 */
import { useEffect, useState } from 'react';

import { useAuthStore } from '@/auth/authStore';
import { StoreService } from '@/iap';
import { useSettingsStore } from '@/stores/settingsStore';

import { useIsPro, useSubscriptionStatus } from './api/queries';
import { isWindowOpen, startWindowIfNeeded } from './helpers/trialWindow';

let evaluated = false;
let shownThisSession = false;

/** Called by `useRootModalPresenter` right after it pushes `/free-trial`. */
export function markFreeTrialShown(): void {
  shownThisSession = true;
}

/**
 * Test seam — also reused as the production sign-out reset
 * (`features/invite/signOutHook.ts`) so the next account starts fresh.
 */
export function _resetForTests(): void {
  evaluated = false;
  shownThisSession = false;
}

export function useFreeTrialEligibility(): boolean {
  const authed = useAuthStore((s) => s.status === 'authed');
  const statusLoaded = useSubscriptionStatus().data !== undefined;
  const isPro = useIsPro();
  const deadline = useSettingsStore((s) => s.trialOfferDeadline);
  const setTrialOfferDeadline = useSettingsStore((s) => s.setTrialOfferDeadline);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (shownThisSession || !authed || !statusLoaded) return;

    if (isPro) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- entitlement flip (external event, e.g. a mid-session purchase)
      setOpen(false);
      return;
    }

    if (evaluated) {
      // Already resolved this session. The deadline is persisted, but "now" keeps moving — the
      // window may have expired since the last time this ran — so re-derive openness and (if still
      // open) schedule a one-shot flip exactly at expiry instead of polling every render.
      const isOpen = isWindowOpen(deadline, Date.now());
      setOpen(isOpen);
      if (!isOpen || deadline === null) return;
      const timer = setTimeout(() => setOpen(false), deadline - Date.now());
      return () => clearTimeout(timer);
    }
    evaluated = true;

    let cancelled = false;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      let eligible = false;
      try {
        eligible = await StoreService.isEligibleForFreeTrial();
      } catch {
        eligible = false;
      }
      if (cancelled) return;

      if (!eligible) {
        setOpen(false);
        return;
      }

      const newDeadline = startWindowIfNeeded(deadline, Date.now());
      if (newDeadline !== deadline) setTrialOfferDeadline(newDeadline);
      const isOpen = isWindowOpen(newDeadline, Date.now());
      setOpen(isOpen);
      if (isOpen) expiryTimer = setTimeout(() => setOpen(false), newDeadline - Date.now());
    })();

    return () => {
      cancelled = true;
      if (expiryTimer) clearTimeout(expiryTimer);
    };
  }, [authed, statusLoaded, isPro, deadline, setTrialOfferDeadline]);

  if (shownThisSession) return false;
  if (!authed || !statusLoaded || isPro) return false;
  return open;
}
