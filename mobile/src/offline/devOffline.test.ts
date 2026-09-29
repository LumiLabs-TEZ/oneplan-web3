import { onlineManager } from '@tanstack/react-query';
import { Alert } from 'react-native';

import { computeOnline, installDevOfflineOverride, useDevOfflineStore } from './devOffline';
import { requireOnline } from './guardOnline';

const t = ((key: string) => key) as unknown as Parameters<typeof requireOnline>[0];

describe('dev offline override', () => {
  let unsubscribe: () => void;

  beforeEach(() => {
    unsubscribe = installDevOfflineOverride();
    onlineManager.setOnline(computeOnline(true));
  });

  afterEach(() => {
    unsubscribe();
    useDevOfflineStore.getState().setForced(false);
    onlineManager.setOnline(true);
    jest.restoreAllMocks();
  });

  it('combines NetInfo with the override', () => {
    expect(computeOnline(true)).toBe(true);
    useDevOfflineStore.getState().setForced(true);
    expect(computeOnline(true)).toBe(false);
    expect(computeOnline(false)).toBe(false);
  });

  it('forcing offline makes requireOnline alert, releasing restores', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    useDevOfflineStore.getState().setForced(true);
    expect(onlineManager.isOnline()).toBe(false);
    expect(requireOnline(t)).toBe(false);
    expect(alertSpy).toHaveBeenCalledWith('Offline', 'Please check your connection and try again.');

    useDevOfflineStore.getState().setForced(false);
    expect(onlineManager.isOnline()).toBe(true);
    expect(requireOnline(t)).toBe(true);
  });

  it('keeps NetInfo-offline offline even when the override is released', () => {
    onlineManager.setOnline(computeOnline(false));
    useDevOfflineStore.getState().setForced(true);
    useDevOfflineStore.getState().setForced(false);
    expect(onlineManager.isOnline()).toBe(false);
  });
});
