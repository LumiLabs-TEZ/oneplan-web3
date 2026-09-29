import { fireEvent, render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { TripEndDeniedScreen } from './TripEndDeniedScreen';
import type { TripEndRequestDto } from '../api/endTrip';

function request(overrides: Partial<TripEndRequestDto> = {}): TripEndRequestDto {
  return {
    id: 1,
    tripId: 10,
    requestedBy: 1,
    status: 'DENIED',
    createdAt: '2026-01-01T00:00:00.000Z',
    resolvedAt: null,
    myDecision: 'APPROVED',
    approvedCount: 1,
    memberCount: 3,
    members: [
      { userId: 1, displayName: 'Ken', avatarUrl: null, decision: 'APPROVED' },
      { userId: 2, displayName: 'Shin', avatarUrl: null, decision: 'DENIED' },
      { userId: 3, displayName: 'Hyydesi', avatarUrl: null, decision: null },
    ],
    ...overrides,
  };
}

describe('TripEndDeniedScreen', () => {
  beforeAll(() => {
    initI18n();
  });

  it('shows a member row per voter, with the right status for each', async () => {
    const screen = await render(
      <TripEndDeniedScreen request={request()} onDismiss={jest.fn()} />,
    );
    expect(screen.getByText('Someone denied')).toBeTruthy();
    expect(screen.getAllByTestId('trip-end-denied-member')).toHaveLength(3);
    expect(screen.getByText('Ken')).toBeTruthy();
    expect(screen.getByText('Approved')).toBeTruthy();
    expect(screen.getByText('Shin')).toBeTruthy();
    expect(screen.getByText('Denied')).toBeTruthy();
    expect(screen.getByText('Hyydesi')).toBeTruthy();
    expect(screen.getByText('Waiting')).toBeTruthy();
  });

  it('calls onDismiss from both the back header and the Go back button', async () => {
    const onDismiss = jest.fn();
    const screen = await render(
      <TripEndDeniedScreen request={request()} onDismiss={onDismiss} />,
    );
    await fireEvent.press(screen.getByTestId('trip-end-back'));
    await fireEvent.press(screen.getByTestId('trip-end-denied-go-back'));
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });
});
