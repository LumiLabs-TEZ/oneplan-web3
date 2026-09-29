import { fireEvent, render, screen } from '@testing-library/react-native';

import type { UserProfileDto } from '@/features/me/useMe';

import { ProfileInfoCard } from './ProfileInfoCard';

const profile: UserProfileDto = {
  id: 1,
  friendCode: 'abc',
  providers: ['EMAIL'],
  isPro: false,
  preferredCurrency: 'USD',
  isAdmin: false,
  locale: 'EN',
  engagementPushEnabled: true,
  engagementConsentGiven: true,
  email: 'ken@example.com',
  displayName: 'Ken',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('ProfileInfoCard', () => {
  it('shows the locked friend-code mock and email', async () => {
    await render(
      <ProfileInfoCard
        profile={profile}
        isPro={false}
        onQrPress={jest.fn()}
        onGetPro={jest.fn()}
        testID="card"
      />,
    );
    expect(screen.getByText('OP-2006-2710')).toBeTruthy();
    expect(screen.getByText('ken@example.com')).toBeTruthy();
  });

  it('falls back to "One Plan User" when the profile has no display name', async () => {
    await render(
      <ProfileInfoCard
        profile={undefined}
        isPro={false}
        onQrPress={jest.fn()}
        onGetPro={jest.fn()}
        testID="card"
      />,
    );
    expect(screen.getByText('One Plan User')).toBeTruthy();
  });

  it('shows Basic + Get Pro when not pro, and calls onGetPro', async () => {
    const onGetPro = jest.fn();
    await render(
      <ProfileInfoCard
        profile={profile}
        isPro={false}
        onQrPress={jest.fn()}
        onGetPro={onGetPro}
        testID="card"
      />,
    );
    expect(screen.getByText('Basic')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('profile-get-pro'));
    expect(onGetPro).toHaveBeenCalledTimes(1);
  });

  it('shows the Pro badge instead of Basic/Get Pro when pro', async () => {
    await render(
      <ProfileInfoCard
        profile={profile}
        isPro
        onQrPress={jest.fn()}
        onGetPro={jest.fn()}
        testID="card"
      />,
    );
    expect(screen.getByTestId('card-pro-badge')).toBeTruthy();
    expect(screen.queryByText('Basic')).toBeNull();
    expect(screen.queryByTestId('profile-get-pro')).toBeNull();
  });

  it('calls onQrPress when the QR area is tapped', async () => {
    const onQrPress = jest.fn();
    await render(
      <ProfileInfoCard
        profile={profile}
        isPro={false}
        onQrPress={onQrPress}
        onGetPro={jest.fn()}
        testID="card"
      />,
    );
    await fireEvent.press(screen.getByTestId('card-qr'));
    expect(onQrPress).toHaveBeenCalledTimes(1);
  });
});
