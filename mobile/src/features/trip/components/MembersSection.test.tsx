import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import React from 'react';

import { initI18n, setAppLanguage } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';

import type { TripMemberDto } from '../types';
import { MembersSection } from './MembersSection';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));

let mockFriends: { user: { id: number; isPro: boolean }; mutualFriendCount: number }[] = [];
jest.mock('@/features/friends/api/queries', () => {
  const actual = jest.requireActual('@/features/friends/api/queries');
  return {
    ...actual,
    useFriends: () => ({ data: mockFriends }),
  };
});

let mockIsPro = false;
jest.mock('@/features/me/useMe', () => ({ useIsPro: () => mockIsPro }));

let mockWeb3Enabled = false;
jest.mock('@/features/vault/web3Flag', () => ({ useWeb3Enabled: () => mockWeb3Enabled }));

let mockLeaveRequests: { userId: number; displayName: string; status: string }[] = [];
const mockSetRoleMutate = jest.fn();
const mockClearVaultLeaveMutate = jest.fn();
const mockConfirmVaultLeaveMutateAsync = jest.fn();
jest.mock('@/features/vault/api/leave', () => ({
  useVaultLeaveRequests: () => ({ data: mockLeaveRequests }),
  useClearVaultLeave: () => ({ mutate: mockClearVaultLeaveMutate }),
  useConfirmVaultLeave: () => ({ mutateAsync: mockConfirmVaultLeaveMutateAsync, isPending: false }),
}));
jest.mock('@/features/vault/api/roles', () => ({
  useSetMemberRole: () => ({ mutate: mockSetRoleMutate }),
}));

const mockPresentMemberRoleMenu = jest.fn();
jest.mock('@/features/vault/helpers/memberRoleMenu', () => ({
  presentMemberRoleMenu: (...args: unknown[]) => mockPresentMemberRoleMenu(...args),
}));

jest.mock('@/features/vault/screens', () => {
  const ReactActual = jest.requireActual('react');
  const { Text: TextActual } = jest.requireActual('react-native');
  return {
    VaultLeaveHostSheet: ReactActual.forwardRef(function MockVaultLeaveHostSheet(
      { request }: { request: { userId: number; displayName: string } | null },
      ref: unknown,
    ) {
      ReactActual.useImperativeHandle(ref, () => ({ present: () => {}, dismiss: () => {} }));
      return request
        ? ReactActual.createElement(TextActual, { testID: 'mock-host-sheet-request' }, request.displayName)
        : null;
    }),
  };
});

function member(overrides: Partial<TripMemberDto> & { userId: number }): TripMemberDto {
  return {
    id: overrides.userId,
    displayName: `User ${overrides.userId}`,
    avatarUrl: null,
    inviteStatus: 'ACCEPTED',
    role: 'MEMBER',
    isPro: false,
    ...overrides,
  };
}

function Wrapper({ children }: { children: ReactNode }) {
  const [client] = React.useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('MembersSection', () => {
  beforeAll(() => {
    initI18n();
  });

  afterEach(async () => {
    mockFriends = [];
    mockIsPro = false;
    mockPush.mockClear();
    mockWeb3Enabled = false;
    mockLeaveRequests = [];
    mockSetRoleMutate.mockReset();
    mockClearVaultLeaveMutate.mockReset();
    mockConfirmVaultLeaveMutateAsync.mockReset();
    mockPresentMemberRoleMenu.mockReset();
    await act(async () => {
      useSettingsStore.setState({ language: 'en' });
    });
  });

  it('renders a row per member, suffixing your own name with (You) and no remove action', async () => {
    const members = [
      member({ userId: 1, displayName: 'Cattie' }),
      member({ userId: 2, displayName: 'hmy' }),
    ];

    const screen = await render(
      <Wrapper>
        <MembersSection members={members} currentUserId={1} />
      </Wrapper>,
    );

    expect(screen.getByText('Cattie (You)')).toBeTruthy();
    expect(screen.getByText('hmy')).toBeTruthy();
    expect(screen.queryByTestId('member-remove-2')).toBeNull();
  });

  it('shows the mutual friends subtitle for every member', async () => {
    mockFriends = [{ user: { id: 2, isPro: false }, mutualFriendCount: 3 }];
    const members = [member({ userId: 1 }), member({ userId: 2 })];

    const screen = await render(
      <Wrapper>
        <MembersSection members={members} currentUserId={1} />
      </Wrapper>,
    );

    expect(screen.getByText('0 mutual friends')).toBeTruthy();
    expect(screen.getByText('3 mutual friends')).toBeTruthy();
  });

  // `MemberRow` calls `t` in its own function body, so it must subscribe to the
  // language store (`useAppLanguage`) — otherwise the React Compiler memoises
  // the row and a language switch leaves stale text.
  it('re-renders member rows when the app language changes', async () => {
    const members = [
      member({ userId: 1, displayName: 'Cattie' }),
      member({ userId: 2, displayName: 'hmy' }),
    ];

    const screen = await render(
      <Wrapper>
        <MembersSection members={members} currentUserId={1} />
      </Wrapper>,
    );

    expect(screen.getAllByText('0 mutual friends')).toHaveLength(2);

    await act(async () => {
      setAppLanguage('vi');
    });

    expect(screen.getAllByText('0 bạn chung')).toHaveLength(2);
  });

  it('has no section header (Invite lives in the trip header)', async () => {
    const screen = await render(
      <Wrapper>
        <MembersSection members={[member({ userId: 1 })]} currentUserId={1} />
      </Wrapper>,
    );

    expect(screen.queryByText('Members')).toBeNull();
    expect(screen.queryByText('Invite')).toBeNull();
  });

  it('draws the PRO avatar only for Pro members', async () => {
    mockIsPro = true;
    const members = [member({ userId: 1 }), member({ userId: 2 })];

    const screen = await render(
      <Wrapper>
        <MembersSection members={members} currentUserId={1} />
      </Wrapper>,
    );

    expect(screen.getAllByTestId('avatar-pro-tab')).toHaveLength(1);
    expect(screen.queryByTestId('avatar-pro-badge')).toBeNull();
  });

  it('hides the friend/add pill on self, shows disabled Friend for a friend and dark Add otherwise', async () => {
    mockFriends = [{ user: { id: 2, isPro: false }, mutualFriendCount: 1 }];
    const members = [
      member({ userId: 1 }),
      member({ userId: 2 }),
      member({ userId: 3, friendCode: 'code-3' }),
    ];

    const screen = await render(
      <Wrapper>
        <MembersSection members={members} currentUserId={1} />
      </Wrapper>,
    );

    expect(screen.queryByTestId('member-action-1')).toBeNull();
    expect(screen.getByTestId('member-action-2')).toBeTruthy();
    expect(screen.getByText('Friend')).toBeTruthy();
    expect(screen.getByTestId('member-action-3')).toBeTruthy();
    expect(screen.getByText('Add')).toBeTruthy();
  });

  it('Add navigates to the friend-code screen', async () => {
    mockFriends = [{ user: { id: 2, isPro: false }, mutualFriendCount: 0 }];
    const members = [
      member({ userId: 1 }),
      member({ userId: 2 }),
      member({ userId: 3, friendCode: 'code-3' }),
    ];

    const screen = await render(
      <Wrapper>
        <MembersSection members={members} currentUserId={1} />
      </Wrapper>,
    );

    await fireEvent.press(screen.getByTestId('member-action-3'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/friend/[code]',
      params: { code: 'code-3' },
    });
  });

  it('the Friend pill is disabled', async () => {
    mockFriends = [{ user: { id: 2, isPro: false }, mutualFriendCount: 0 }];
    const members = [member({ userId: 1 }), member({ userId: 2 })];

    const screen = await render(
      <Wrapper>
        <MembersSection members={members} currentUserId={1} />
      </Wrapper>,
    );

    expect(screen.getByTestId('member-action-2').props.accessibilityState?.disabled).toBe(true);
  });

  // Regression: a disabled RN `Pressable` declines the responder, so a tap on a naively
  // `disabled`-prop trailing pill would fall through to the row's own `onPress` and
  // navigate — a dead zone in iOS, so it must be one here too.
  it('the disabled Friend pill is a true dead zone — it does not fall through to the row navigation', async () => {
    mockFriends = [{ user: { id: 2, isPro: false }, mutualFriendCount: 0 }];
    const members = [member({ userId: 1 }), member({ userId: 2 })];

    const screen = await render(
      <Wrapper>
        <MembersSection members={members} currentUserId={1} />
      </Wrapper>,
    );

    await fireEvent.press(screen.getByTestId('member-action-2'));

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('tapping a non-self row navigates to the friend profile; self row is a no-op', async () => {
    const members = [member({ userId: 1 }), member({ userId: 2 })];

    const screen = await render(
      <Wrapper>
        <MembersSection members={members} currentUserId={1} />
      </Wrapper>,
    );

    await fireEvent.press(screen.getByTestId('member-row-2'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/friend-profile/[userId]',
      params: { userId: '2' },
    });

    mockPush.mockClear();
    await fireEvent.press(screen.getByTestId('member-row-1'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  describe('flag off equals develop (H2)', () => {
    it('shows no Host/Co-host pill and no name-row wrapper, even though the server sets role=HOST', async () => {
      mockWeb3Enabled = false;
      const members = [
        member({ userId: 1, role: 'HOST' }),
        member({ userId: 2, role: 'CO_HOST' }),
        member({ userId: 3, role: 'MEMBER' }),
      ];

      const screen = await render(
        <Wrapper>
          <MembersSection members={members} currentUserId={1} tripId={5} isCreator />
        </Wrapper>,
      );

      expect(screen.queryByText('Host')).toBeNull();
      expect(screen.queryByText('Co-host')).toBeNull();
      expect(screen.queryByTestId('member-name-row-1')).toBeNull();
      expect(screen.queryByTestId('member-name-row-2')).toBeNull();
      // The name is still there, as a bare Text directly under the row's main column.
      expect(screen.getByText('User 2')).toBeTruthy();
    });

    it('flag on: the pill and wrapper come back for HOST/CO_HOST only', async () => {
      mockWeb3Enabled = true;
      const members = [
        member({ userId: 1, role: 'HOST' }),
        member({ userId: 2, role: 'CO_HOST' }),
        member({ userId: 3, role: 'MEMBER' }),
      ];

      const screen = await render(
        <Wrapper>
          <MembersSection members={members} currentUserId={1} tripId={5} isCreator />
        </Wrapper>,
      );

      expect(screen.getByText('Host')).toBeTruthy();
      expect(screen.getByText('Co-host')).toBeTruthy();
      expect(screen.getByTestId('member-name-row-3')).toBeTruthy();
    });
  });

  describe('web3 role menu', () => {
    it('is hidden with the web3 flag off, even for a creator with tripId set', async () => {
      mockWeb3Enabled = false;
      const members = [member({ userId: 1 }), member({ userId: 2 })];

      const screen = await render(
        <Wrapper>
          <MembersSection members={members} currentUserId={1} tripId={5} isCreator />
        </Wrapper>,
      );

      expect(screen.queryByTestId('member-role-menu-2')).toBeNull();
    });

    it('is hidden for a non-creator even with the flag on', async () => {
      mockWeb3Enabled = true;
      const members = [member({ userId: 1 }), member({ userId: 2 })];

      const screen = await render(
        <Wrapper>
          <MembersSection members={members} currentUserId={1} tripId={5} isCreator={false} />
        </Wrapper>,
      );

      expect(screen.queryByTestId('member-role-menu-2')).toBeNull();
    });

    it('is hidden on your own row even as creator', async () => {
      mockWeb3Enabled = true;
      const members = [member({ userId: 1 }), member({ userId: 2 })];

      const screen = await render(
        <Wrapper>
          <MembersSection members={members} currentUserId={1} tripId={5} isCreator />
        </Wrapper>,
      );

      expect(screen.queryByTestId('member-role-menu-1')).toBeNull();
      expect(screen.getByTestId('member-role-menu-2')).toBeTruthy();
    });

    it('shows the Host/Co-host badge and offers "Make co-host" for a plain member', async () => {
      mockWeb3Enabled = true;
      const members = [
        member({ userId: 1, role: 'HOST' }),
        member({ userId: 2, role: 'MEMBER' }),
      ];

      const screen = await render(
        <Wrapper>
          <MembersSection members={members} currentUserId={1} tripId={5} isCreator />
        </Wrapper>,
      );

      expect(screen.getByText('Host')).toBeTruthy();
      await fireEvent.press(screen.getByTestId('member-role-menu-2'));

      expect(mockPresentMemberRoleMenu).toHaveBeenCalledTimes(1);
      const [, displayName, options] = mockPresentMemberRoleMenu.mock.calls[0] as [
        unknown,
        string,
        { roleActionTitle: string; onSelectRole: () => void; clearVaultLeaveTitle?: string },
      ];
      expect(displayName).toBe('User 2');
      expect(options.roleActionTitle).toBe('Make co-host');
      expect(options.clearVaultLeaveTitle).toBeUndefined();

      options.onSelectRole();
      expect(mockSetRoleMutate).toHaveBeenCalledWith(
        { userId: 2, role: 'CO_HOST' },
        expect.any(Object),
      );
    });

    it('offers "Remove as co-host" for a co-host, and calls setRole with MEMBER', async () => {
      mockWeb3Enabled = true;
      const members = [member({ userId: 1, role: 'HOST' }), member({ userId: 2, role: 'CO_HOST' })];

      const screen = await render(
        <Wrapper>
          <MembersSection members={members} currentUserId={1} tripId={5} isCreator />
        </Wrapper>,
      );

      expect(screen.getByText('Co-host')).toBeTruthy();
      await fireEvent.press(screen.getByTestId('member-role-menu-2'));

      const options = mockPresentMemberRoleMenu.mock.calls[0]![2] as {
        roleActionTitle: string;
        onSelectRole: () => void;
      };
      expect(options.roleActionTitle).toBe('Remove as co-host');

      options.onSelectRole();
      expect(mockSetRoleMutate).toHaveBeenCalledWith(
        { userId: 2, role: 'MEMBER' },
        expect.any(Object),
      );
    });

    it('vault trip, no pending leave: offers "Mark paid for leave" and calls clearVaultLeave', async () => {
      mockWeb3Enabled = true;
      mockLeaveRequests = [];
      const members = [member({ userId: 1, role: 'HOST' }), member({ userId: 2 })];

      const screen = await render(
        <Wrapper>
          <MembersSection members={members} currentUserId={1} tripId={5} isCreator hasVault />
        </Wrapper>,
      );

      await fireEvent.press(screen.getByTestId('member-role-menu-2'));
      const options = mockPresentMemberRoleMenu.mock.calls[0]![2] as {
        clearVaultLeaveTitle?: string;
        onSelectClearVaultLeave?: () => void;
      };
      expect(options.clearVaultLeaveTitle).toBe('Mark paid for leave');

      options.onSelectClearVaultLeave?.();
      expect(mockClearVaultLeaveMutate).toHaveBeenCalledWith(2, expect.any(Object));
    });

    it('vault trip with a pending leave request: offers "Confirm leave" and opens the host sheet', async () => {
      mockWeb3Enabled = true;
      mockLeaveRequests = [{ userId: 2, displayName: 'User 2', status: 'READY' }];
      const members = [member({ userId: 1, role: 'HOST' }), member({ userId: 2 })];

      const screen = await render(
        <Wrapper>
          <MembersSection members={members} currentUserId={1} tripId={5} isCreator hasVault />
        </Wrapper>,
      );

      await fireEvent.press(screen.getByTestId('member-role-menu-2'));
      const options = mockPresentMemberRoleMenu.mock.calls[0]![2] as {
        clearVaultLeaveTitle?: string;
        onSelectClearVaultLeave?: () => void;
      };
      expect(options.clearVaultLeaveTitle).toBe('Confirm leave');

      await act(async () => options.onSelectClearVaultLeave?.());
      expect(mockClearVaultLeaveMutate).not.toHaveBeenCalled();
      expect(screen.getByTestId('mock-host-sheet-request')).toHaveTextContent('User 2');
    });

    it('non-vault trip never offers the vault-leave menu item', async () => {
      mockWeb3Enabled = true;
      mockLeaveRequests = [];
      const members = [member({ userId: 1, role: 'HOST' }), member({ userId: 2 })];

      const screen = await render(
        <Wrapper>
          <MembersSection members={members} currentUserId={1} tripId={5} isCreator hasVault={false} />
        </Wrapper>,
      );

      await fireEvent.press(screen.getByTestId('member-role-menu-2'));
      const options = mockPresentMemberRoleMenu.mock.calls[0]![2] as { clearVaultLeaveTitle?: string };
      expect(options.clearVaultLeaveTitle).toBeUndefined();
    });
  });
});
