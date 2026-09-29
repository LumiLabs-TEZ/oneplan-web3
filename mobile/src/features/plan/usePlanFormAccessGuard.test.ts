import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { router } from 'expo-router';

import { usePlanFormAccessGuard } from './usePlanFormAccessGuard';

jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));

const t = (key: string) => key;

describe('usePlanFormAccessGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  it('does nothing and returns false when ready and canEdit is true', async () => {
    const { result } = await renderHook(() =>
      usePlanFormAccessGuard({ ready: true, canEdit: true }, t),
    );

    expect(result.current).toBe(false);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('alerts and navigates back when ready and canEdit is false', async () => {
    const { result } = await renderHook(() =>
      usePlanFormAccessGuard({ ready: true, canEdit: false }, t),
    );

    expect(result.current).toBe(true);
    expect(Alert.alert).toHaveBeenCalledWith(
      'Offline',
      "You're offline\nOnly an ongoing trip can be viewed offline",
    );
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('while loading (not ready, canEdit false) returns true (keep showing loading) but does not alert or navigate', async () => {
    const { result } = await renderHook(() =>
      usePlanFormAccessGuard({ ready: false, canEdit: false }, t),
    );

    // `blocked` is true here too so the caller keeps rendering its loading state, but this is
    // NOT the read-only guard firing — no alert, no back navigation.
    expect(result.current).toBe(true);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('alerts once and navigates back once when the trip finishes loading as read-only', async () => {
    const { result, rerender } = await renderHook(
      ({ ready, canEdit }: { ready: boolean; canEdit: boolean }) =>
        usePlanFormAccessGuard({ ready, canEdit }, t),
      { initialProps: { ready: false, canEdit: false } },
    );
    expect(result.current).toBe(true);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();

    await act(async () => {
      rerender({ ready: true, canEdit: false });
    });

    expect(result.current).toBe(true);
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('never alerts when the trip finishes loading as editable', async () => {
    const { result, rerender } = await renderHook(
      ({ ready, canEdit }: { ready: boolean; canEdit: boolean }) =>
        usePlanFormAccessGuard({ ready, canEdit }, t),
      { initialProps: { ready: false, canEdit: false } },
    );

    await act(async () => {
      rerender({ ready: true, canEdit: true });
    });

    expect(result.current).toBe(false);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('fires again if canEdit flips from true to false after mount (already ready)', async () => {
    const { rerender } = await renderHook(
      ({ canEdit }: { canEdit: boolean }) => usePlanFormAccessGuard({ ready: true, canEdit }, t),
      { initialProps: { canEdit: true } },
    );
    expect(router.back).not.toHaveBeenCalled();

    await act(async () => {
      rerender({ canEdit: false });
    });

    expect(router.back).toHaveBeenCalledTimes(1);
  });
});
