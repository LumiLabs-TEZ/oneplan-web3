import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert } from 'react-native';

import { ApiMutationError } from '@/api/mutationError';
import { initI18n } from '@/i18n';

import { RequestPlanSheet } from './RequestPlanSheet';

const mockMutateAsync = jest.fn();
jest.mock('../api/mutations', () => ({
  useRequestPlan: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));
jest.mock('@/offline/guardOnline', () => ({ requireOnline: () => true }));
jest.mock('@/features/currency/api/queries', () => ({
  ...jest.requireActual('@/features/currency/api/queries'),
  useCurrencies: () => ({ data: undefined }),
}));
// The real sheet runs location queries; a stub row that picks Hanoi stands in for it.
jest.mock('@/features/location/components/LocationSearchSheet', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    LocationSearchSheet: React.forwardRef(function LocationSearchSheetStub(
      { onSelect }: { onSelect: (value: unknown) => void },
      _ref: unknown,
    ) {
      return React.createElement(
        Pressable,
        {
          testID: 'stub-pick-hanoi',
          onPress: () =>
            onSelect({
              city: { id: 7, name: 'Hanoi' },
              state: { id: 3, name: 'Hà Nội' },
              country: { id: 1, name: 'Vietnam' },
            }),
        },
        React.createElement(Text, null, 'pick'),
      );
    }),
  };
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('RequestPlanSheet', () => {
  beforeAll(() => {
    initI18n();
  });
  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockMutateAsync.mockReset();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders SwiftUI defaults', async () => {
    const screen = await render(<RequestPlanSheet />, { wrapper });
    expect(screen.getByText('Where will you go?')).toBeTruthy();
    expect(screen.getByTestId('request-plan-tag')).toHaveTextContent(/Friends/);
    expect(screen.getByText('2 people')).toBeTruthy();
    expect(screen.getByText('3 days')).toBeTruthy();
    expect(screen.getByTestId('request-plan-currency')).toHaveTextContent(/VND/);
  });

  it('clamps steppers at their bounds', async () => {
    const screen = await render(<RequestPlanSheet />, { wrapper });
    await fireEvent.press(screen.getByTestId('request-plan-people-decrement'));
    expect(screen.getByText('1 person')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('request-plan-people-decrement'));
    expect(screen.getByText('1 person')).toBeTruthy();
    for (let i = 0; i < 40; i += 1) {
      await fireEvent.press(screen.getByTestId('request-plan-days-increment'));
    }
    expect(screen.getByText('30 days')).toBeTruthy();
  });

  it('groups the budget as it is typed', async () => {
    const screen = await render(<RequestPlanSheet />, { wrapper });
    await fireEvent.changeText(screen.getByTestId('request-plan-budget'), '2500000');
    expect(screen.getByTestId('request-plan-budget').props.value).toBe('2,500,000');
  });

  it('requires a destination before submitting', async () => {
    const screen = await render(<RequestPlanSheet />, { wrapper });
    await fireEvent.press(screen.getByTestId('request-plan-submit'));
    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Destination required',
      'Please choose where you want to go before submitting.',
    );
  });

  it('submits the request and resets the form', async () => {
    mockMutateAsync.mockResolvedValue({});
    const screen = await render(<RequestPlanSheet />, { wrapper });
    await fireEvent.press(screen.getByTestId('stub-pick-hanoi'));
    expect(screen.getByText('Hanoi')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('request-plan-budget'), '1500000');
    await fireEvent.changeText(screen.getByTestId('request-plan-description'), '  food tour ');
    await fireEvent.press(screen.getByTestId('request-plan-submit'));
    expect(mockMutateAsync).toHaveBeenCalledWith({
      countryId: 1,
      stateId: 3,
      cityId: 7,
      tag: 'FRIENDS',
      currency: 'VND',
      participantCount: 2,
      dayCount: 3,
      budget: 1500000,
      description: 'food tour',
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      'Request submitted',
      "We'll send you a notification when the plan is available.",
    );
    expect(screen.getByText('Where will you go?')).toBeTruthy();
  });

  it('reports an already-open request on 409', async () => {
    mockMutateAsync.mockRejectedValue(new ApiMutationError(409, {}));
    const screen = await render(<RequestPlanSheet />, { wrapper });
    await fireEvent.press(screen.getByTestId('stub-pick-hanoi'));
    await fireEvent.press(screen.getByTestId('request-plan-submit'));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Request already open',
      'You already have an open request for this destination.',
    );
  });
});
