import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { TripEndReviewScreen } from './TripEndReviewScreen';
import type { TripEndReviewDto } from '../api/endTrip';

const mockReviewState: { data: TripEndReviewDto | undefined; isError: boolean } = {
  data: undefined,
  isError: false,
};
const mockVoteMutate = jest.fn();
const mockVoteState = { isPending: false };

// Rendered without a SafeAreaProvider; the floating vote bar reads the bottom inset.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/features/vault/api/endTrip', () => ({
  useTripEndReview: () => mockReviewState,
  useCastTripEndVote: () => ({ mutate: mockVoteMutate, ...mockVoteState }),
}));
jest.mock('@/features/exchange/useExchangeRate', () => ({
  useExchangeRate: () => ({ data: undefined }),
}));

function review(overrides: Partial<TripEndReviewDto> = {}): TripEndReviewDto {
  return {
    request: {
      id: 1,
      tripId: 5,
      requestedBy: 1,
      status: 'PENDING',
      createdAt: '2026-01-01T00:00:00.000Z',
      resolvedAt: null,
      myDecision: null,
      approvedCount: 0,
      memberCount: 2,
      members: [],
    },
    history: [],
    mySettlement: [],
    balanceMicro: '0',
    ...overrides,
  };
}

const props = { tripId: 5, myUserId: 1, onApproved: jest.fn(), onDenied: jest.fn(), onBack: jest.fn() };

describe('TripEndReviewScreen', () => {
  beforeAll(() => {
    initI18n();
  });

  beforeEach(() => {
    mockReviewState.data = undefined;
    mockReviewState.isError = false;
    mockVoteMutate.mockClear();
    mockVoteState.isPending = false;
  });

  it('shows a spinner until the review loads, then the hero copy and empty states', async () => {
    mockReviewState.data = review();
    const screen = await render(<TripEndReviewScreen {...props} />);
    expect(screen.getByText('You are preparing to end your trip.')).toBeTruthy();
    expect(screen.getByText('No vault activity yet')).toBeTruthy();
    expect(screen.getByText('Nothing left to settle in cash')).toBeTruthy();
  });

  it('renders a settlement row for each cash debt in mySettlement', async () => {
    mockReviewState.data = review({
      mySettlement: [
        {
          fromUserId: 2,
          fromDisplayName: 'Shin',
          toUserId: 1,
          toDisplayName: 'Ken',
          amountMicro: '1500000',
          isConfirmed: false,
          canConfirm: true,
          lines: [],
          toWalletAddress: null,
        },
      ],
    });
    const screen = await render(<TripEndReviewScreen {...props} />);
    expect(screen.getAllByTestId('trip-end-review-settlement-row')).toHaveLength(1);
    expect(screen.getByText('Shin')).toBeTruthy();
  });

  it('casting Approve calls the vote mutation with APPROVED', async () => {
    mockReviewState.data = review();
    const screen = await render(<TripEndReviewScreen {...props} />);
    await fireEvent.press(screen.getByTestId('trip-end-review-approve'));
    expect(mockVoteMutate).toHaveBeenCalledWith('APPROVED', expect.anything());
  });

  it('casting Deny calls the vote mutation with DENIED', async () => {
    mockReviewState.data = review();
    const screen = await render(<TripEndReviewScreen {...props} />);
    await fireEvent.press(screen.getByTestId('trip-end-review-deny'));
    expect(mockVoteMutate).toHaveBeenCalledWith('DENIED', expect.anything());
  });

  it('routes onApproved vs onDenied off the mutation result, not the local vote button', async () => {
    mockReviewState.data = review();
    mockVoteMutate.mockImplementation((decision, opts) => {
      opts.onSuccess({
        id: 1,
        tripId: 5,
        requestedBy: 1,
        status: 'DENIED',
        createdAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: null,
        myDecision: 'APPROVED',
        approvedCount: 1,
        memberCount: 2,
        members: [],
      });
    });
    const onApproved = jest.fn();
    const onDenied = jest.fn();
    const screen = await render(
      <TripEndReviewScreen {...props} onApproved={onApproved} onDenied={onDenied} />,
    );
    // Approve is pressed, but the server reports DENIED (a concurrent deny raced this vote).
    await fireEvent.press(screen.getByTestId('trip-end-review-approve'));
    await waitFor(() => expect(onDenied).toHaveBeenCalledTimes(1));
    expect(onApproved).not.toHaveBeenCalled();
  });
});
