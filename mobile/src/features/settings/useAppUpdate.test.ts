import { act, renderHook } from '@testing-library/react-native';
import * as Updates from 'expo-updates';

import { useAppUpdate } from './useAppUpdate';

const mocked = Updates as jest.Mocked<typeof Updates> & { isEnabled: boolean };

function setEnabled(value: boolean) {
  Object.defineProperty(Updates, 'isEnabled', { value, configurable: true });
}

describe('useAppUpdate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setEnabled(true);
  });

  afterAll(() => setEnabled(false));

  it('reports unavailable when expo-updates is disabled (dev client)', async () => {
    setEnabled(false);
    const { result } = await renderHook(() => useAppUpdate());
    await act(() => result.current.check());
    expect(result.current.status).toBe('unavailable');
    expect(mocked.checkForUpdateAsync).not.toHaveBeenCalled();
  });

  it('reports up to date when no update is available', async () => {
    mocked.checkForUpdateAsync.mockResolvedValueOnce({ isAvailable: false } as never);
    const { result } = await renderHook(() => useAppUpdate());
    await act(() => result.current.check());
    expect(result.current.status).toBe('upToDate');
    expect(mocked.fetchUpdateAsync).not.toHaveBeenCalled();
  });

  it('downloads and reloads into an available update', async () => {
    mocked.checkForUpdateAsync.mockResolvedValueOnce({ isAvailable: true } as never);
    const { result } = await renderHook(() => useAppUpdate());
    await act(() => result.current.check());
    expect(mocked.fetchUpdateAsync).toHaveBeenCalledTimes(1);
    expect(mocked.reloadAsync).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('restarting');
  });

  it('reports an error when the check throws', async () => {
    mocked.checkForUpdateAsync.mockRejectedValueOnce(new Error('offline'));
    const { result } = await renderHook(() => useAppUpdate());
    await act(() => result.current.check());
    expect(result.current.status).toBe('error');
  });
});
