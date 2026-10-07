import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert, type AlertButton, View } from 'react-native';
import { type Metrics, SafeAreaProvider } from 'react-native-safe-area-context';

import { ApiMutationError } from '@/api/mutationError';
import { initI18n } from '@/i18n';
import type { BudgetDto, ExpenseSummaryDto, PlanItemDto, TripDto } from '@/features/trip/types';

import { TripMenuController } from './TripMenuController';

jest.mock('@/features/subscription/api/queries', () => ({ useIsPro: () => false }));

const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    replace: (...a: unknown[]) => mockReplace(...a),
    dismissTo: (...a: unknown[]) => mockDismissTo(...a),
    push: (...a: unknown[]) => mockPush(...a),
  },
}));

// --- vault (web3) ------------------------------------------------------------
// Default to "classic trip" so every pre-existing test below keeps exercising the plain PATCH
// path unchanged; only the dedicated vault-branch tests below flip these.
const mockWeb3State = { enabled: false };
const mockHasVault = { hasVault: false, isLoading: false };
const mockRequestTripEndMutate = jest.fn();
jest.mock('@/features/vault/web3Flag', () => ({ useWeb3Enabled: () => mockWeb3State.enabled }));
jest.mock('@/features/vault/api/tripHasVault', () => ({
  useTripHasVault: () => mockHasVault,
}));
const mockVaultBlocksDelete = jest.fn(async () => false);
jest.mock('@/features/vault/deleteGuard', () => ({
  ...jest.requireActual('@/features/vault/deleteGuard'),
  vaultBlocksDelete: () => mockVaultBlocksDelete(),
}));
jest.mock('@/features/vault/api/endTrip', () => ({
  useRequestTripEnd: () => ({ mutate: (...a: unknown[]) => mockRequestTripEndMutate(...a) }),
}));

// --- mutations -------------------------------------------------------------
// `calls` records the ORDER of every write so the dates flow can assert that the schedule
// PATCH lands before the plan-item deletes.
const calls: string[] = [];
const mockUpdateMutate = jest.fn();
const mockUpdateMutateAsync = jest.fn(async (body: unknown) => {
  calls.push(`PATCH ${JSON.stringify(body)}`);
  return {} as TripDto;
});
const mockDeleteTripMutate = jest.fn();
const mockDeletePlanItemAsync = jest.fn(async (id: number) => {
  calls.push(`DELETE plan-item ${id}`);
});
const mockDeletePlanItemOptions: unknown[] = [];

jest.mock('@/features/trip/api/mutations', () => ({
  useUpdateTrip: () => ({
    mutate: (...a: unknown[]) => mockUpdateMutate(...a),
    mutateAsync: (body: unknown) => mockUpdateMutateAsync(body),
    isPending: false,
  }),
  useDeleteTrip: () => ({ mutate: (...a: unknown[]) => mockDeleteTripMutate(...a) }),
  useDeletePlanItem: (_tripId: number, opts?: unknown) => {
    mockDeletePlanItemOptions.push(opts);
    return { mutateAsync: (id: number) => mockDeletePlanItemAsync(id) };
  },
  invalidateTrip: jest.fn(async () => undefined),
  invalidateTripLists: jest.fn(async () => undefined),
}));

// --- data ------------------------------------------------------------------
const mockPlanItems: { data: PlanItemDto[] } = { data: [] };
jest.mock('@/features/trip/api/queries', () => ({
  usePlanItems: () => mockPlanItems,
}));

// The catalog query would hit the network; the sheet falls back to the static table.
jest.mock('@/features/currency/api/queries', () => ({
  ...jest.requireActual('@/features/currency/api/queries'),
  useCurrencies: () => ({ data: undefined }),
}));

const mockDetail: { trip: TripDto; budgets: BudgetDto[]; expenses: ExpenseSummaryDto[] } = {
  trip: {} as TripDto,
  budgets: [],
  expenses: [],
};
jest.mock('@/features/trip/TripDetailContext', () => ({
  useTripCore: () => ({ tripId: 7, trip: mockDetail.trip }),
  useTripBudgets: () => mockDetail.budgets,
  useTripExpenses: () => ({ expenses: mockDetail.expenses, expensesLoading: false }),
}));

// ---------------------------------------------------------------------------

const CREATOR_ID = 42;
const TODAY = new Date(2026, 0, 1); // Jan 1 2026

function trip(overrides: Partial<TripDto> = {}): TripDto {
  return {
    id: 7,
    name: 'Da Lat',
    createdById: CREATOR_ID,
    status: 'PLANNING',
    currency: 'VND',
    localCurrencies: [],
    startDate: null,
    endDate: null,
    members: [],
    ...overrides,
  } as unknown as TripDto;
}

function planItem(id: number, dayNumber: number): PlanItemDto {
  return { id, dayNumber } as PlanItemDto;
}

// The date sheets read safe-area insets.
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
}

const menuMock = jest.requireMock('@react-native-menu/menu') as {
  __menuInstances: {
    onPressAction?: (event: { nativeEvent: { event: string } }) => void;
    testID?: string;
  }[];
};

/** Picks a row from the native menu (the mocked `MenuView` records its latest props). */
async function selectMenuItem(id: string) {
  const menu = menuMock.__menuInstances.findLast((m) => m.testID === 'trip-menu-button');
  if (!menu) throw new Error('trip menu not rendered');
  await act(async () => {
    menu.onPressAction?.({ nativeEvent: { event: id } });
  });
}

function renderMenu() {
  return render(
    <TripMenuController
      currentUserId={CREATOR_ID}
      onLeave={jest.fn()}
      today={TODAY}
      testID="trip-menu-button"
    >
      <View />
    </TripMenuController>,
    { wrapper },
  );
}

/** The `onPress` of the alert button whose label matches, from the latest `Alert.alert` call. */
function alertButton(alertSpy: jest.SpyInstance, label: string): AlertButton | undefined {
  const lastCall = alertSpy.mock.calls.at(-1);
  const buttons = lastCall?.[2] as AlertButton[] | undefined;
  return buttons?.find((b) => b.text === label);
}

let alertSpy: jest.SpyInstance;

describe('TripMenuController', () => {
  beforeAll(() => {
    initI18n();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    calls.length = 0;
    mockDeletePlanItemOptions.length = 0;
    mockDetail.trip = trip();
    mockDetail.budgets = [];
    mockDetail.expenses = [];
    mockPlanItems.data = [];
    mockUpdateMutateAsync.mockImplementation(async (body: unknown) => {
      calls.push(`PATCH ${JSON.stringify(body)}`);
      return {} as TripDto;
    });
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('(a) explains the lock instead of opening the group picker on an ended trip', async () => {
    mockDetail.trip = trip({ status: 'ENDED' });
    await renderMenu();

    await selectMenuItem('groupCurrency');

    expect(alertSpy).toHaveBeenCalledWith("Currency can't be changed after the trip has ended.");
    expect(mockUpdateMutate).not.toHaveBeenCalled();
  });

  it('(b) confirms the conversion when the trip already holds money', async () => {
    mockDetail.budgets = [{ id: 1 } as BudgetDto];
    const screen = await renderMenu();

    await fireEvent.press(screen.getByTestId('group-currency-row-USD'));
    await fireEvent.press(screen.getByTestId('group-currency-confirm'));

    expect(alertSpy).toHaveBeenCalledWith(
      'Convert to USD?',
      "All budgets and expenses — including settled amounts — will be converted at today's exchange rate.",
      expect.any(Array),
    );
    expect(mockUpdateMutate).not.toHaveBeenCalled();

    alertButton(alertSpy, 'Convert')?.onPress?.();

    expect(mockUpdateMutate).toHaveBeenCalledWith({ currency: 'USD' }, expect.anything());
  });

  it('(c) switches the group currency directly on an empty trip', async () => {
    const screen = await renderMenu();

    await fireEvent.press(screen.getByTestId('group-currency-row-USD'));
    await fireEvent.press(screen.getByTestId('group-currency-confirm'));

    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockUpdateMutate).toHaveBeenCalledWith({ currency: 'USD' }, expect.anything());
  });

  it('(c2) ignores a re-pick of the current group currency', async () => {
    const screen = await renderMenu();

    await fireEvent.press(screen.getByTestId('group-currency-row-VND'));
    await fireEvent.press(screen.getByTestId('group-currency-confirm'));

    expect(mockUpdateMutate).not.toHaveBeenCalled();
  });

  it('(d) clears the local currency from the None row', async () => {
    mockDetail.trip = trip({ localCurrencies: ['THB'] });
    const screen = await renderMenu();

    await fireEvent.press(screen.getByTestId('local-currency-row-none'));
    await fireEvent.press(screen.getByTestId('local-currency-confirm'));

    expect(mockUpdateMutate).toHaveBeenCalledWith({ localCurrencies: [] }, expect.anything());
  });

  it('(e) starts an already-scheduled trip with a status-only PATCH', async () => {
    mockDetail.trip = trip({ startDate: '2026-01-05', endDate: '2026-01-09' });
    await renderMenu();

    await selectMenuItem('startTrip');

    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalled());
    expect(mockUpdateMutateAsync).toHaveBeenCalledWith({ status: 'ONGOING' });
  });

  it('(f) surfaces the member-conflict names on a 400', async () => {
    mockDetail.trip = trip({ startDate: '2026-01-05', endDate: '2026-01-09' });
    mockUpdateMutateAsync.mockRejectedValueOnce(
      new ApiMutationError(400, {
        statusCode: 400,
        error: 'MEMBER_CONFLICT',
        memberNames: ['Mai'],
      }),
    );
    await renderMenu();

    await selectMenuItem('startTrip');

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Mai is currently on another trip. They need to end or leave that trip before you can start this one.',
      ),
    );
  });

  it('(f2) pluralises the conflict alert for several members', async () => {
    mockDetail.trip = trip({ startDate: '2026-01-05', endDate: '2026-01-09' });
    mockUpdateMutateAsync.mockRejectedValueOnce(
      new ApiMutationError(400, {
        statusCode: 400,
        error: 'MEMBER_CONFLICT',
        memberNames: ['Mai', 'Ken'],
      }),
    );
    await renderMenu();

    await selectMenuItem('startTrip');

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Mai, Ken are currently on other trips. They need to end or leave their trips before you can start this one.',
      ),
    );
  });

  it('(g) confirms a shrink, then PATCHes the dates BEFORE deleting the lost plans', async () => {
    mockDetail.trip = trip({ startDate: '2026-01-05', endDate: '2026-01-09' });
    mockPlanItems.data = [planItem(1, 1), planItem(9, 5)];
    const screen = await renderMenu();

    // Jan 5 → Jan 6 is a 2-day trip, so the day-5 plan item no longer has a day to live on.
    const dates = within(screen.getByTestId('trip-dates-sheet'));
    await fireEvent.press(dates.getByTestId('calendar-day-2026-01-05'));
    await fireEvent.press(dates.getByTestId('calendar-day-2026-01-06'));
    await fireEvent.press(screen.getByTestId('trip-dates-confirm'));

    expect(alertSpy).toHaveBeenCalledWith(
      'Removing days will delete 1 plan',
      'Plans on trailing days will be permanently removed.',
      expect.any(Array),
    );
    expect(mockUpdateMutateAsync).not.toHaveBeenCalled();

    alertButton(alertSpy, 'Remove')?.onPress?.();

    await waitFor(() => expect(mockDeletePlanItemAsync).toHaveBeenCalledWith(9));
    // Dates first: a failed delete must never leave the schedule unsaved.
    expect(calls).toEqual([
      'PATCH {"startDate":"2026-01-05","endDate":"2026-01-06"}',
      'DELETE plan-item 9',
    ]);
    // The batch invalidates once at the end, not per item.
    expect(mockDeletePlanItemOptions[0]).toEqual({ skipInvalidate: true });
  });

  it('(g2) reports a partial failure without claiming the dates were lost', async () => {
    mockDetail.trip = trip({ startDate: '2026-01-05', endDate: '2026-01-09' });
    mockPlanItems.data = [planItem(9, 5)];
    mockDeletePlanItemAsync.mockRejectedValueOnce(new ApiMutationError(500, null));
    const screen = await renderMenu();

    const dates = within(screen.getByTestId('trip-dates-sheet'));
    await fireEvent.press(dates.getByTestId('calendar-day-2026-01-05'));
    await fireEvent.press(dates.getByTestId('calendar-day-2026-01-06'));
    await fireEvent.press(screen.getByTestId('trip-dates-confirm'));
    alertButton(alertSpy, 'Remove')?.onPress?.();

    await waitFor(() =>
      expect(alertSpy).toHaveBeenLastCalledWith(
        'Trip dates saved, but some plans could not be removed.',
      ),
    );
    expect(calls).toEqual(['PATCH {"startDate":"2026-01-05","endDate":"2026-01-06"}']);
  });

  it('(g3) skips the confirm alert when no plans are lost', async () => {
    mockDetail.trip = trip({ startDate: '2026-01-05', endDate: '2026-01-09' });
    mockPlanItems.data = [planItem(1, 1)];
    const screen = await renderMenu();

    const dates = within(screen.getByTestId('trip-dates-sheet'));
    await fireEvent.press(dates.getByTestId('calendar-day-2026-01-05'));
    await fireEvent.press(dates.getByTestId('calendar-day-2026-01-06'));
    await fireEvent.press(screen.getByTestId('trip-dates-confirm'));

    expect(alertSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalled());
    expect(mockDeletePlanItemAsync).not.toHaveBeenCalled();
  });

  it('routes End trip through a confirm to the end screen', async () => {
    mockDetail.trip = trip({ status: 'ONGOING' });
    await renderMenu();

    await selectMenuItem('endTrip');
    expect(alertSpy).toHaveBeenCalledWith(
      'End trip?',
      'This will end the trip for all members. This action cannot be undone.',
      expect.any(Array),
    );

    alertButton(alertSpy, 'End trip')?.onPress?.();
    expect(mockUpdateMutate).toHaveBeenCalledWith({ status: 'ENDED' }, expect.anything());
  });

  it('routes End trip through the vault consensus flow for a web3-enabled vault trip', async () => {
    mockWeb3State.enabled = true;
    mockHasVault.hasVault = true;
    mockHasVault.isLoading = false;
    try {
      mockDetail.trip = trip({ status: 'ONGOING' });
      await renderMenu();

      await selectMenuItem('endTrip');
      alertButton(alertSpy, 'End trip')?.onPress?.();

      expect(mockRequestTripEndMutate).toHaveBeenCalledWith(undefined, expect.anything());
      // Same confirm alert as the classic flow — only the destructive action's target differs.
      expect(mockUpdateMutate).not.toHaveBeenCalled();

      const opts = mockRequestTripEndMutate.mock.calls[0]?.[1] as {
        onSuccess: (request: unknown) => void;
      };
      opts.onSuccess({ id: 1, tripId: 7, status: 'PENDING', myDecision: null });
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/trip/[tripId]/end-review',
        params: { tripId: '7' },
      });
      // A request I already voted on (409 recovery) lands on Waiting instead.
      mockPush.mockClear();
      opts.onSuccess({ id: 1, tripId: 7, status: 'PENDING', myDecision: 'APPROVED' });
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/trip/[tripId]/end-waiting',
        params: { tripId: '7' },
      });
    } finally {
      mockWeb3State.enabled = false;
      mockHasVault.hasVault = false;
    }
  });

  it('End trip does not fall through to the classic PATCH while the vault check is still unresolved', async () => {
    mockWeb3State.enabled = true;
    mockHasVault.hasVault = false;
    mockHasVault.isLoading = true;
    try {
      mockDetail.trip = trip({ status: 'ONGOING' });
      await renderMenu();

      await selectMenuItem('endTrip');

      // No confirm alert with a decision baked in yet — the vault check hasn't settled.
      expect(alertSpy).not.toHaveBeenCalledWith('End trip?', expect.anything(), expect.anything());
      expect(mockUpdateMutate).not.toHaveBeenCalled();
      expect(mockRequestTripEndMutate).not.toHaveBeenCalled();
    } finally {
      mockWeb3State.enabled = false;
      mockHasVault.isLoading = false;
    }
  });

  it('routes Delete trip through a confirm to useDeleteTrip', async () => {
    await renderMenu();

    await selectMenuItem('deleteTrip');
    alertButton(alertSpy, 'Delete')?.onPress?.();

    expect(mockDeleteTripMutate).toHaveBeenCalledWith(7, expect.anything());
  });

  it('blocks Delete trip while the group wallet still holds money', async () => {
    mockWeb3State.enabled = true;
    mockVaultBlocksDelete.mockResolvedValueOnce(true);
    try {
      await renderMenu();

      await selectMenuItem('deleteTrip');

      await waitFor(() =>
        expect(alertSpy).toHaveBeenLastCalledWith(
          'Settle the group wallet first',
          "This trip's group wallet still holds money. Settle all payments before deleting the trip.",
        ),
      );
      expect(alertButton(alertSpy, 'Delete')).toBeUndefined();
      expect(mockDeleteTripMutate).not.toHaveBeenCalled();
    } finally {
      mockWeb3State.enabled = false;
    }
  });

  it('confirms Delete trip normally once the group wallet is empty', async () => {
    mockWeb3State.enabled = true;
    try {
      await renderMenu();

      await selectMenuItem('deleteTrip');
      await waitFor(() => expect(alertButton(alertSpy, 'Delete')).toBeDefined());
      alertButton(alertSpy, 'Delete')?.onPress?.();

      expect(mockDeleteTripMutate).toHaveBeenCalledWith(7, expect.anything());
    } finally {
      mockWeb3State.enabled = false;
    }
  });

  it('shows the settle-first alert when the server refuses with vault_not_empty', async () => {
    await renderMenu();

    await selectMenuItem('deleteTrip');
    alertButton(alertSpy, 'Delete')?.onPress?.();
    const opts = mockDeleteTripMutate.mock.calls.at(-1)?.[1] as {
      onError: (err: unknown) => void;
    };
    opts.onError(new ApiMutationError(400, { code: 'vault_not_empty', message: 'x' }));

    expect(alertSpy).toHaveBeenLastCalledWith(
      'Settle the group wallet first',
      "This trip's group wallet still holds money. Settle all payments before deleting the trip.",
    );
  });

  it('routes Leave group to the onLeave prop for a non-creator', async () => {
    const onLeave = jest.fn();
    await render(
      <TripMenuController
        currentUserId={999}
        onLeave={onLeave}
        today={TODAY}
        testID="trip-menu-button"
      >
        <View />
      </TripMenuController>,
      { wrapper },
    );

    await selectMenuItem('leaveGroup');

    expect(onLeave).toHaveBeenCalled();
  });
});
