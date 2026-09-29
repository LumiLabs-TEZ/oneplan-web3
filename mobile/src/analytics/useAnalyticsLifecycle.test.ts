import { renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { useAuthStore } from '@/auth/authStore';

import { getAnalyticsClient } from './client';
import { useAnalyticsLifecycle } from './useAnalyticsLifecycle';

jest.mock('./client', () => {
  const client = {
    onForeground: jest.fn(),
    onBackground: jest.fn(),
    onAuthChanged: jest.fn(),
  };
  return { getAnalyticsClient: () => client };
});

type Listener = (state: AppStateStatus) => void;

let listener: Listener | null = null;
const remove = jest.fn();

beforeEach(() => {
  listener = null;
  remove.mockClear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, fn) => {
    listener = fn as Listener;
    return { remove };
  });
  useAuthStore.setState({ status: 'anon', ready: true });
  const client = getAnalyticsClient();
  (client.onForeground as jest.Mock).mockClear();
  (client.onBackground as jest.Mock).mockClear();
  (client.onAuthChanged as jest.Mock).mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useAnalyticsLifecycle', () => {
  it('resolves the session on mount and follows AppState transitions', async () => {
    const client = getAnalyticsClient();
    const { unmount } = await renderHook(() => useAnalyticsLifecycle());
    expect(client.onForeground).toHaveBeenCalledTimes(1);
    expect(listener).not.toBeNull();

    listener!('inactive');
    expect(client.onBackground).toHaveBeenCalledTimes(1);
    listener!('background');
    expect(client.onBackground).toHaveBeenCalledTimes(1); // inactive→background is one transition
    listener!('active');
    expect(client.onForeground).toHaveBeenCalledTimes(2);
    listener!('active');
    expect(client.onForeground).toHaveBeenCalledTimes(2);

    await unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('forwards auth status changes and unsubscribes on unmount', async () => {
    const client = getAnalyticsClient();
    const { unmount } = await renderHook(() => useAnalyticsLifecycle());

    useAuthStore.setState({ status: 'authed' });
    expect(client.onAuthChanged).toHaveBeenCalledWith('authed');
    useAuthStore.setState({ ready: true }); // unrelated change → no call
    expect(client.onAuthChanged).toHaveBeenCalledTimes(1);
    useAuthStore.setState({ status: 'anon' });
    expect(client.onAuthChanged).toHaveBeenLastCalledWith('anon');

    await unmount();
    useAuthStore.setState({ status: 'authed' });
    expect(client.onAuthChanged).toHaveBeenCalledTimes(2);
  });
});
