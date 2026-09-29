import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import React from 'react';

import { initI18n } from '@/i18n';

import { TripEndWaitingScreen } from './TripEndWaitingScreen';
import type { TripEndRequestDto } from '../api/endTrip';

let mockRequestData: TripEndRequestDto | undefined;

jest.mock('@/features/vault/api/endTrip', () => ({
  useTripEndRequest: () => ({ data: mockRequestData }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function request(overrides: Partial<TripEndRequestDto> = {}): TripEndRequestDto {
  return {
    id: 1,
    tripId: 10,
    requestedBy: 1,
    status: 'PENDING',
    createdAt: '2026-01-01T00:00:00.000Z',
    resolvedAt: null,
    myDecision: 'APPROVED',
    approvedCount: 1,
    memberCount: 3,
    members: [],
    ...overrides,
  };
}

describe('TripEndWaitingScreen', () => {
  beforeAll(() => {
    initI18n();
  });

  beforeEach(() => {
    mockRequestData = undefined;
  });

  it('renders the waiting copy and Go back / back header controls', async () => {
    mockRequestData = request();
    const onBack = jest.fn();
    const screen = await render(
      <TripEndWaitingScreen
        tripId={10}
        onBack={onBack}
        onAllApproved={jest.fn()}
        onDenied={jest.fn()}
      />,
      { wrapper },
    );
    expect(screen.getByText('Waiting for others to approve.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('trip-end-back'));
    await fireEvent.press(screen.getByTestId('trip-end-waiting-go-back'));
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it('calls onAllApproved once the request status flips to APPROVED', async () => {
    mockRequestData = request({ status: 'APPROVED' });
    const onAllApproved = jest.fn();
    await render(
      <TripEndWaitingScreen
        tripId={10}
        onBack={jest.fn()}
        onAllApproved={onAllApproved}
        onDenied={jest.fn()}
      />,
      { wrapper },
    );
    await waitFor(() => expect(onAllApproved).toHaveBeenCalledTimes(1));
  });

  it('calls onDenied with the request once the status flips to DENIED', async () => {
    const denied = request({ status: 'DENIED' });
    mockRequestData = denied;
    const onDenied = jest.fn();
    await render(
      <TripEndWaitingScreen
        tripId={10}
        onBack={jest.fn()}
        onAllApproved={jest.fn()}
        onDenied={onDenied}
      />,
      { wrapper },
    );
    await waitFor(() => expect(onDenied).toHaveBeenCalledWith(denied));
  });

  it('does nothing while still PENDING', async () => {
    mockRequestData = request({ status: 'PENDING' });
    const onAllApproved = jest.fn();
    const onDenied = jest.fn();
    await render(
      <TripEndWaitingScreen
        tripId={10}
        onBack={jest.fn()}
        onAllApproved={onAllApproved}
        onDenied={onDenied}
      />,
      { wrapper },
    );
    expect(onAllApproved).not.toHaveBeenCalled();
    expect(onDenied).not.toHaveBeenCalled();
  });
});
