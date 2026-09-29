import { fireEvent, render, screen } from '@testing-library/react-native';
import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { initI18n } from '@/i18n';
import { tripUrl } from '@/links/deepLinkBuilder';

import { TripInviteCard } from './TripInviteCard';

beforeAll(() => {
  initI18n();
});

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('TripInviteCard', () => {
  it('renders the trip name, the QR prompt and the invite link', async () => {
    await render(<TripInviteCard tripName="Da Lat" coverImageUrl={null} inviteCode="abc123" />);

    expect(screen.getByText('Da Lat')).toBeTruthy();
    expect(
      screen.getByText('Join the group and plan together by scanning the QR code below!'),
    ).toBeTruthy();
    expect(screen.getByText(tripUrl('abc123'))).toBeTruthy();
    expect(screen.getByTestId('trip-invite-qr')).toBeTruthy();
  });

  it('shares the trip URL when the Share pill is tapped', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);

    await render(<TripInviteCard tripName="Da Lat" coverImageUrl={null} inviteCode="abc123" />);
    await fireEvent.press(screen.getByTestId('trip-invite-share'));

    expect(share).toHaveBeenCalledWith({
      message: tripUrl('abc123'),
      title: 'Join Da Lat on OnePlan',
    });
  });

  it('copies the link on a long press', async () => {
    const copy = jest.spyOn(Clipboard, 'setStringAsync').mockResolvedValue(true);

    await render(<TripInviteCard tripName="Da Lat" coverImageUrl={null} inviteCode="abc123" />);
    await fireEvent(screen.getByTestId('trip-invite-share'), 'longPress');

    expect(copy).toHaveBeenCalledWith(tripUrl('abc123'));
  });
});
