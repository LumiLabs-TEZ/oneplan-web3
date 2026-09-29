import { fireEvent, render, screen } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { FriendActionArea } from './FriendActionArea';

beforeAll(() => {
  initI18n();
});

describe('FriendActionArea', () => {
  it('renders Add friend for none and fires add', async () => {
    const onAction = jest.fn();
    await render(<FriendActionArea status="none" isPerformingAction={false} onAction={onAction} />);
    await fireEvent.press(screen.getByTestId('friend-action-add'));
    expect(onAction).toHaveBeenCalledWith('add');
  });

  it('renders Cancel request for pending_sent', async () => {
    const onAction = jest.fn();
    await render(
      <FriendActionArea status="pending_sent" isPerformingAction={false} onAction={onAction} />,
    );
    await fireEvent.press(screen.getByTestId('friend-action-cancel'));
    expect(onAction).toHaveBeenCalledWith('cancel');
  });

  it('renders Accept and Decline for pending_received', async () => {
    const onAction = jest.fn();
    await render(
      <FriendActionArea status="pending_received" isPerformingAction={false} onAction={onAction} />,
    );
    await fireEvent.press(screen.getByTestId('friend-action-accept'));
    expect(onAction).toHaveBeenCalledWith('accept');
    await fireEvent.press(screen.getByTestId('friend-action-decline'));
    expect(onAction).toHaveBeenCalledWith('decline');
  });

  it('renders nothing for friends', async () => {
    await render(
      <FriendActionArea status="friends" isPerformingAction={false} onAction={jest.fn()} />,
    );
    expect(screen.queryByTestId('friend-action-add')).toBeNull();
    expect(screen.queryByTestId('friend-action-cancel')).toBeNull();
    expect(screen.queryByTestId('friend-action-accept')).toBeNull();
    expect(screen.queryByTestId('friend-action-decline')).toBeNull();
  });
});
