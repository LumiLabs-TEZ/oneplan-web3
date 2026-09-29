import { onlineManager } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { ApiMutationError } from '@/api/mutationError';
import { initI18n } from '@/i18n';

import { useDeleteAccount } from './useDeleteAccount';

beforeAll(() => {
  initI18n();
});

/** Captures the buttons passed to the confirmation alert and exposes helpers to tap one. */
function spyOnConfirmAlert() {
  return jest
    .spyOn(Alert, 'alert')
    .mockImplementation(
      (_title?: string, _message?: string, buttons?: { text?: string; onPress?: () => void }[]) =>
        undefined,
    );
}

function pressDelete(alertSpy: jest.SpyInstance) {
  const call = alertSpy.mock.calls.find((c) => c[0] === 'Delete Account?');
  const buttons = call?.[2] as { text?: string; onPress?: () => void }[] | undefined;
  const deleteButton = buttons?.find((b) => b.text === 'Delete');
  deleteButton?.onPress?.();
}

describe('useDeleteAccount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it('blocks the flow and alerts "Offline" when offline, without showing the confirm alert', async () => {
    onlineManager.setOnline(false);
    const alertSpy = spyOnConfirmAlert();
    const confirmWithBiometrics = jest.fn(async () => 'ok' as const);
    const deleteAccount = jest.fn(async () => undefined);
    const { result } = await renderHook(() =>
      useDeleteAccount({ confirmWithBiometrics, deleteAccount }),
    );

    await act(async () => result.current.run());

    expect(alertSpy).toHaveBeenCalledWith('Offline', 'Please check your connection and try again.');
    expect(confirmWithBiometrics).not.toHaveBeenCalled();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it('shows the confirm alert with Cancel and destructive Delete buttons', async () => {
    const alertSpy = spyOnConfirmAlert();
    const { result } = await renderHook(() => useDeleteAccount());

    await act(async () => result.current.run());

    expect(alertSpy).toHaveBeenCalledWith(
      'Delete Account?',
      'This action is permanent. All your trips, expenses, photos, and data will be deleted forever.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: expect.any(Function) },
      ],
    );
  });

  it('deletes the account when biometrics resolve "ok"', async () => {
    const alertSpy = spyOnConfirmAlert();
    const confirmWithBiometrics = jest.fn(async () => 'ok' as const);
    const deleteAccount = jest.fn(async () => undefined);
    const { result } = await renderHook(() =>
      useDeleteAccount({ confirmWithBiometrics, deleteAccount }),
    );

    await act(async () => result.current.run());
    await act(async () => pressDelete(alertSpy));

    expect(confirmWithBiometrics).toHaveBeenCalledWith(
      'Confirm to permanently delete your account',
      { cancelLabel: 'Cancel' },
    );
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledTimes(1); // only the confirm alert, no error alert
  });

  it('alerts "Authentication not available" and does not call deleteAccount when unavailable', async () => {
    const alertSpy = spyOnConfirmAlert();
    const confirmWithBiometrics = jest.fn(async () => 'unavailable' as const);
    const deleteAccount = jest.fn(async () => undefined);
    const { result } = await renderHook(() =>
      useDeleteAccount({ confirmWithBiometrics, deleteAccount }),
    );

    await act(async () => result.current.run());
    await act(async () => pressDelete(alertSpy));

    expect(deleteAccount).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('Authentication not available on this device');
  });

  it('alerts "Authentication failed" and does not call deleteAccount when failed', async () => {
    const alertSpy = spyOnConfirmAlert();
    const confirmWithBiometrics = jest.fn(async () => 'failed' as const);
    const deleteAccount = jest.fn(async () => undefined);
    const { result } = await renderHook(() =>
      useDeleteAccount({ confirmWithBiometrics, deleteAccount }),
    );

    await act(async () => result.current.run());
    await act(async () => pressDelete(alertSpy));

    expect(deleteAccount).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('Authentication failed');
  });

  it('does nothing (no alert, no delete) when cancelled', async () => {
    const alertSpy = spyOnConfirmAlert();
    const confirmWithBiometrics = jest.fn(async () => 'cancelled' as const);
    const deleteAccount = jest.fn(async () => undefined);
    const { result } = await renderHook(() =>
      useDeleteAccount({ confirmWithBiometrics, deleteAccount }),
    );

    await act(async () => result.current.run());
    await act(async () => pressDelete(alertSpy));

    expect(deleteAccount).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledTimes(1); // only the confirm alert
  });

  it('alerts a generic failure message when deleteAccount rejects', async () => {
    const alertSpy = spyOnConfirmAlert();
    const confirmWithBiometrics = jest.fn(async () => 'ok' as const);
    const deleteAccount = jest.fn(async () => {
      throw new ApiMutationError(500, { message: 'boom' });
    });
    const { result } = await renderHook(() =>
      useDeleteAccount({ confirmWithBiometrics, deleteAccount }),
    );

    await act(async () => result.current.run());
    await act(async () => pressDelete(alertSpy));

    expect(alertSpy).toHaveBeenCalledWith('Failed to delete account. Please try again.');
  });

  it('sets pending true while the flow runs and false once settled', async () => {
    const alertSpy = spyOnConfirmAlert();
    let resolveConfirm: (outcome: 'ok') => void = () => undefined;
    const confirmWithBiometrics = jest.fn(
      () => new Promise<'ok'>((resolve) => (resolveConfirm = resolve)),
    );
    const deleteAccount = jest.fn(async () => undefined);
    const { result } = await renderHook(() =>
      useDeleteAccount({ confirmWithBiometrics, deleteAccount }),
    );

    await act(async () => result.current.run());
    await act(async () => pressDelete(alertSpy));

    expect(result.current.pending).toBe(true);

    await act(async () => {
      resolveConfirm('ok');
    });

    expect(result.current.pending).toBe(false);
  });
});
