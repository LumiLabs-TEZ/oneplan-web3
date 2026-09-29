import { renderHook, act } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { setBadgeCountAsync, requestPermissionsAsync } from 'expo-notifications';
import { useBadgeClear } from './useBadgeClear';
jest.mock('expo-notifications', () => ({
  setBadgeCountAsync: jest.fn(async () => true),
  requestPermissionsAsync: jest.fn(),
}));
it('clears at mount and foreground without asking permission, and removes its listener', async () => {
  let listener: (state: AppStateStatus) => void = () => undefined;
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    listener = callback;
    return { remove };
  });
  const view = await renderHook(() => useBadgeClear());
  expect(setBadgeCountAsync).toHaveBeenCalledWith(0);
  await act(() => listener('background'));
  expect(setBadgeCountAsync).toHaveBeenCalledTimes(1);
  await act(() => listener('active'));
  expect(setBadgeCountAsync).toHaveBeenCalledTimes(2);
  expect(requestPermissionsAsync).not.toHaveBeenCalled();
  await view.unmount();
  expect(remove).toHaveBeenCalled();
});
