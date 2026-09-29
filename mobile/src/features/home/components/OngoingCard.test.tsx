import { fireEvent, render, screen } from '@testing-library/react-native';

import type { components } from '@/api/schema';
import { initI18n } from '@/i18n';

import { OngoingCard } from './OngoingCard';

type TripSummaryDto = components['schemas']['TripSummaryDto'];
type TripMemberDto = components['schemas']['TripMemberDto'];

const trip: TripSummaryDto = {
  id: 7,
  name: 'Da Lat weekend',
  coverImageUrl: 'https://cdn.example.com/cover.jpg?sig=x',
  status: 'ONGOING',
  memberCount: 6,
  currency: 'VND',
  location: { cityName: 'Da Lat', countryName: 'Vietnam' },
};

function member(id: number, inviteStatus: TripMemberDto['inviteStatus']): TripMemberDto {
  return {
    id,
    userId: id,
    displayName: `M${id}`,
    avatarUrl: null,
    inviteStatus,
    role: 'MEMBER',
    isPro: false,
  };
}

const members = [
  member(1, 'ACCEPTED'),
  member(2, 'ACCEPTED'),
  member(3, 'ACCEPTED'),
  member(4, 'ACCEPTED'),
  member(5, 'ACCEPTED'),
  member(6, 'PENDING'),
];

beforeAll(() => {
  initI18n();
});

describe('OngoingCard', () => {
  it('renders the trip name and location label', async () => {
    await render(
      <OngoingCard trip={trip} members={members} onPress={jest.fn()} onNewExpense={jest.fn()} />,
    );
    expect(screen.getByText('Da Lat weekend')).toBeTruthy();
    expect(screen.getByText('Da Lat, Vietnam')).toBeTruthy();
  });

  it('shows the default trip placeholder when there is no cover image', async () => {
    await render(
      <OngoingCard
        trip={{ ...trip, coverImageUrl: null }}
        members={members}
        onPress={jest.fn()}
        onNewExpense={jest.fn()}
      />,
    );
    expect(screen.getByTestId('ongoing-cover-placeholder')).toBeTruthy();
  });

  it('shows "+N" for accepted members beyond the first three (pending excluded)', async () => {
    await render(
      <OngoingCard trip={trip} members={members} onPress={jest.fn()} onNewExpense={jest.fn()} />,
    );
    expect(screen.getAllByTestId('avatar-stack-item')).toHaveLength(3);
    expect(screen.getByTestId('avatar-stack-remaining')).toHaveTextContent('+2');
  });

  it('pressing the card fires onPress only', async () => {
    const onPress = jest.fn();
    const onNewExpense = jest.fn();
    await render(
      <OngoingCard trip={trip} members={members} onPress={onPress} onNewExpense={onNewExpense} />,
    );
    await fireEvent.press(screen.getByTestId('ongoing-card'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onNewExpense).not.toHaveBeenCalled();
  });

  it('pressing "New expense" fires onNewExpense only', async () => {
    const onPress = jest.fn();
    const onNewExpense = jest.fn();
    await render(
      <OngoingCard trip={trip} members={members} onPress={onPress} onNewExpense={onNewExpense} />,
    );
    await fireEvent.press(screen.getByTestId('ongoing-new-expense'));
    expect(onNewExpense).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByText('New expense')).toBeTruthy();
  });
});
