import { onlineManager } from '@tanstack/react-query';
import { Alert } from 'react-native';

import { requireOnline } from './guardOnline';

const t = ((key: string) => key) as unknown as Parameters<typeof requireOnline>[0];

describe('requireOnline', () => {
  afterEach(() => {
    onlineManager.setOnline(true);
    jest.restoreAllMocks();
  });

  it('returns true and shows nothing while online', () => {
    onlineManager.setOnline(true);
    const alertSpy = jest.spyOn(Alert, 'alert');
    expect(requireOnline(t)).toBe(true);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('returns false and alerts while offline', () => {
    onlineManager.setOnline(false);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    expect(requireOnline(t)).toBe(false);
    expect(alertSpy).toHaveBeenCalledWith('Offline', 'Please check your connection and try again.');
  });
});
