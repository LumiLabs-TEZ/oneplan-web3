import { fireEvent, render } from '@testing-library/react-native';
import { Share } from 'react-native';

import { FriendQrCard } from './FriendQrCard';

jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });

describe('FriendQrCard', () => {
  afterEach(() => jest.clearAllMocks());

  it('shows a loading placeholder instead of the QR code when friendCode is missing', async () => {
    const screen = await render(<FriendQrCard friendCode={null} />);
    expect(screen.getByTestId('friend-qr-loading')).toBeTruthy();
  });

  it('renders the friend URL in the URL row once friendCode is present', async () => {
    const screen = await render(<FriendQrCard friendCode="abc123" />);
    expect(screen.queryByTestId('friend-qr-loading')).toBeNull();
    expect(screen.getByText(/abc123/)).toBeTruthy();
  });

  it('shows the raw scanned text verbatim when lastScannedCode is set', async () => {
    const screen = await render(
      <FriendQrCard friendCode="abc123" lastScannedCode="junk-not-a-code" />,
    );
    expect(screen.getByText('junk-not-a-code')).toBeTruthy();
  });

  it('shares the friend URL (not the displayed scanned text) on Share tap', async () => {
    const screen = await render(
      <FriendQrCard friendCode="abc123" lastScannedCode="junk-not-a-code" />,
    );
    fireEvent.press(screen.getByTestId('invite-share'));
    expect(Share.share).toHaveBeenCalledTimes(1);
    const [arg] = (Share.share as jest.Mock).mock.calls[0];
    expect(arg.message).toContain('abc123');
    expect(arg.message).not.toContain('junk-not-a-code');
    expect(arg.title).toBe('Add me on OnePlan');
  });

  it('disables Share when there is no friendCode yet', async () => {
    const screen = await render(<FriendQrCard friendCode={null} />);
    const pill = screen.getByTestId('invite-share');
    expect(pill.props.accessibilityState.disabled).toBe(true);
  });
});
