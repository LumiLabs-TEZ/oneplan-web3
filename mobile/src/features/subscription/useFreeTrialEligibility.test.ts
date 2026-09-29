import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useSettingsStore } from '@/stores/settingsStore';

let mockAuthed = true;
jest.mock('@/auth/authStore', () => ({
  useAuthStore: (sel: (s: { status: string }) => unknown) =>
    sel({ status: mockAuthed ? 'authed' : 'anon' }),
}));

let mockIsPro = false;
let mockStatusData: unknown = { tier: 'free', status: 'ACTIVE' };
jest.mock('./api/queries', () => ({
  useIsPro: () => mockIsPro,
  useSubscriptionStatus: () => ({ data: mockStatusData }),
}));

const mockIsEligibleForFreeTrial = jest.fn();
jest.mock('@/iap', () => ({
  StoreService: { isEligibleForFreeTrial: () => mockIsEligibleForFreeTrial() },
}));

// eslint-disable-next-line import/first -- must follow the jest.mock calls above
import {
  _resetForTests,
  markFreeTrialShown,
  useFreeTrialEligibility,
} from './useFreeTrialEligibility';

beforeEach(() => {
  jest.clearAllMocks();
  _resetForTests();
  mockAuthed = true;
  mockIsPro = false;
  mockStatusData = { tier: 'free', status: 'ACTIVE' };
  useSettingsStore.setState({ trialOfferDeadline: null });
});

describe('useFreeTrialEligibility', () => {
  it('is false for a Pro user (never hits the store)', async () => {
    mockIsPro = true;
    const { result } = await renderHook(() => useFreeTrialEligibility());

    await waitFor(() => expect(result.current).toBe(false));
    expect(mockIsEligibleForFreeTrial).not.toHaveBeenCalled();
  });

  it('is false while the subscription status has not loaded yet', async () => {
    mockStatusData = undefined;
    const { result } = await renderHook(() => useFreeTrialEligibility());

    expect(result.current).toBe(false);
    expect(mockIsEligibleForFreeTrial).not.toHaveBeenCalled();
  });

  it('is false when the store reports the user is not eligible', async () => {
    mockIsEligibleForFreeTrial.mockResolvedValue(false);
    const { result } = await renderHook(() => useFreeTrialEligibility());

    await waitFor(() => expect(mockIsEligibleForFreeTrial).toHaveBeenCalledTimes(1));
    expect(result.current).toBe(false);
    expect(useSettingsStore.getState().trialOfferDeadline).toBeNull();
  });

  it('starts the 1h window and returns true when eligible', async () => {
    mockIsEligibleForFreeTrial.mockResolvedValue(true);
    const before = Date.now();
    const { result } = await renderHook(() => useFreeTrialEligibility());

    await waitFor(() => expect(result.current).toBe(true));
    const deadline = useSettingsStore.getState().trialOfferDeadline;
    expect(deadline).not.toBeNull();
    expect(deadline as number).toBeGreaterThanOrEqual(before + 3_600_000);
  });

  it('is false once the persisted window has already expired', async () => {
    useSettingsStore.setState({ trialOfferDeadline: Date.now() - 1_000 });
    mockIsEligibleForFreeTrial.mockResolvedValue(true);
    const { result } = await renderHook(() => useFreeTrialEligibility());

    await waitFor(() => expect(mockIsEligibleForFreeTrial).toHaveBeenCalledTimes(1));
    expect(result.current).toBe(false);
  });

  it('never throws — a rejected store check resolves to false', async () => {
    mockIsEligibleForFreeTrial.mockRejectedValue(new Error('store unavailable'));
    const { result } = await renderHook(() => useFreeTrialEligibility());

    await waitFor(() => expect(result.current).toBe(false));
  });

  it('evaluates the store check once per session, even across remounts', async () => {
    mockIsEligibleForFreeTrial.mockResolvedValue(true);
    const first = await renderHook(() => useFreeTrialEligibility());
    await waitFor(() => expect(first.result.current).toBe(true));
    await act(async () => first.unmount());

    const second = await renderHook(() => useFreeTrialEligibility());
    await waitFor(() => expect(second.result.current).toBe(true));

    expect(mockIsEligibleForFreeTrial).toHaveBeenCalledTimes(1);
    await act(async () => second.unmount());
  });

  it('re-evaluates the boolean result when isPro flips true mid-session', async () => {
    mockIsEligibleForFreeTrial.mockResolvedValue(true);
    const { result, rerender, unmount } = await renderHook(() => useFreeTrialEligibility());
    await waitFor(() => expect(result.current).toBe(true));

    mockIsPro = true;
    await act(async () => rerender({}));

    await waitFor(() => expect(result.current).toBe(false));
    expect(mockIsEligibleForFreeTrial).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('is false once markFreeTrialShown() has been called, even while still eligible (once-per-launch)', async () => {
    mockIsEligibleForFreeTrial.mockResolvedValue(true);
    const { result, rerender, unmount } = await renderHook(() => useFreeTrialEligibility());
    await waitFor(() => expect(result.current).toBe(true));

    markFreeTrialShown();
    await act(async () => rerender({}));

    expect(result.current).toBe(false);
    unmount();
  });

  it("markFreeTrialShown() does not depend on this hook's own deps changing — a bare rerender picks it up", async () => {
    // Regression for the re-push loop: a dismissal changes the root-modal store, not any of
    // useFreeTrialEligibility's own inputs (authed/statusLoaded/isPro/deadline). The render-time
    // short-circuit (checked unconditionally at the top of the function body, not just inside the
    // effect) must apply on the very next render regardless — the presenter's re-render after
    // `markRootModalDismissed` is driven entirely by a different store.
    mockIsEligibleForFreeTrial.mockResolvedValue(true);
    const { result, rerender, unmount } = await renderHook(() => useFreeTrialEligibility());
    await waitFor(() => expect(result.current).toBe(true));

    markFreeTrialShown();
    await act(async () => {
      rerender({});
    });

    expect(result.current).toBe(false);
    unmount();
  });

  it('flips to false exactly when the persisted window expires while the hook stays mounted', async () => {
    // A short, already-persisted deadline (startWindowIfNeeded keeps an existing deadline as-is)
    // lets this assert against a REAL setTimeout firing, rather than mixing fake timers with
    // `waitFor`'s own timer-based polling.
    useSettingsStore.setState({ trialOfferDeadline: Date.now() + 50 });
    mockIsEligibleForFreeTrial.mockResolvedValue(true);
    const { result, unmount } = await renderHook(() => useFreeTrialEligibility());
    await waitFor(() => expect(result.current).toBe(true));

    await waitFor(() => expect(result.current).toBe(false), { timeout: 2_000 });

    unmount();
  });
});
