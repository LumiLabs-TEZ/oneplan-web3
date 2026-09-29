import { render, screen } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { FriendProfileHeader, LOCKED_FRIEND_CODE_LABEL } from './FriendProfileHeader';

beforeAll(() => {
  initI18n();
});

describe('FriendProfileHeader', () => {
  it('shows the Pro badge and locked friend code when friendCode is present', async () => {
    await render(
      <FriendProfileHeader
        displayName="Anh"
        friendCode="abc"
        requestStatus="none"
        isPerformingAction={false}
        isPro
        onAction={jest.fn()}
      />,
    );
    expect(screen.getByText('Anh')).toBeTruthy();
    expect(screen.getByText('Pro')).toBeTruthy();
    expect(screen.getByText(LOCKED_FRIEND_CODE_LABEL)).toBeTruthy();
    expect(screen.getByTestId('friend-action-add')).toBeTruthy();
  });

  it('hides the friend code line and the add button when friendCode is null', async () => {
    await render(
      <FriendProfileHeader
        displayName="Anh"
        friendCode={null}
        requestStatus="none"
        isPerformingAction={false}
        isPro={false}
        onAction={jest.fn()}
      />,
    );
    expect(screen.queryByText(LOCKED_FRIEND_CODE_LABEL)).toBeNull();
    expect(screen.queryByTestId('friend-action-add')).toBeNull();
  });
});
