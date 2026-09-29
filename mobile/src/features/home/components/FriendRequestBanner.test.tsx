import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import type { FriendRequestDto } from '@/features/friends/types';
import { initI18n } from '@/i18n';

import { FriendRequestBanner } from './FriendRequestBanner';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

let mockRequests: FriendRequestDto[] | undefined;
jest.mock('@/features/friends/api/queries', () => ({
  useFriendRequests: () => ({ data: mockRequests }),
}));

const mockMutate = jest.fn();
jest.mock('@/features/friends/api/mutations', () => ({
  useDeclineFriendRequest: () => ({ mutate: mockMutate, isPending: false }),
}));

function request(id: number, name: string): FriendRequestDto {
  return {
    id,
    sender: {
      id: id * 10,
      displayName: name,
      avatarUrl: null,
      isPro: false,
      memberSince: '2025-01-01T00:00:00.000Z',
    },
    mutualFriendCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

beforeAll(() => {
  initI18n();
});

beforeEach(() => {
  mockRequests = undefined;
  mockMutate.mockReset();
  jest.mocked(router.push).mockReset();
});

describe('FriendRequestBanner', () => {
  it('renders null while loading or when there are no requests', async () => {
    await render(<FriendRequestBanner />);
    expect(screen.toJSON()).toBeNull();

    mockRequests = [];
    await render(<FriendRequestBanner />);
    expect(screen.toJSON()).toBeNull();
  });

  it('shows the oldest request (the API lists newest first)', async () => {
    mockRequests = [request(2, 'Newer'), request(1, 'Khang')];
    await render(<FriendRequestBanner />);

    expect(screen.getByText('New friend request')).toBeTruthy();
    expect(screen.getByText('Khang')).toBeTruthy();
    expect(screen.queryByText('Newer')).toBeNull();
  });

  it('stacks the waiting requests behind the front card with a +N badge', async () => {
    mockRequests = [request(3, 'Newest'), request(2, 'Middle'), request(1, 'Khang')];
    await render(<FriendRequestBanner />);

    expect(screen.getByText('Khang')).toBeTruthy();
    expect(screen.getByTestId('friend-request-banner-stack-badge')).toHaveTextContent('+2');
    expect(screen.getAllByTestId('friend-request-banner-stack-depth')).toHaveLength(2);
  });

  it('shows no badge for a single request', async () => {
    mockRequests = [request(1, 'Khang')];
    await render(<FriendRequestBanner />);

    expect(screen.queryByTestId('friend-request-banner-stack-badge')).toBeNull();
  });

  it('"View" opens the friend-request modal', async () => {
    mockRequests = [request(1, 'Khang')];
    await render(<FriendRequestBanner />);

    await fireEvent.press(screen.getByTestId('friend-request-banner-view'));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/friend-request/[id]',
      params: { id: '1' },
    });
  });

  it('the trash declines the request on the server', async () => {
    mockRequests = [request(1, 'Khang')];
    await render(<FriendRequestBanner />);

    await fireEvent.press(screen.getByTestId('friend-request-banner-decline'));

    expect(mockMutate).toHaveBeenCalledWith(1, expect.any(Object));
  });

  it('alerts when the decline fails', async () => {
    mockMutate.mockImplementation((_id: number, opts: { onError: (e: Error) => void }) =>
      opts.onError(new Error('boom')),
    );
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockRequests = [request(1, 'Khang')];
    await render(<FriendRequestBanner />);

    await fireEvent.press(screen.getByTestId('friend-request-banner-decline'));

    expect(alertSpy).toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
