import { act, fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';
import MissionsScreen from './MissionsScreen';
import mockFixture from './fixtures/overview.json';
const mockReplace = jest.fn();
const mockReport = jest.fn(async () => ({ awarded: false, balance: 120 }));
const mockRedeem = jest.fn();
const mockDismissals: (() => void)[] = [];
let mockIsPro = false;
let mockPending = false;
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 62, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ source: 'profile' }),
}));
jest.mock('./api/queries', () => ({
  useMissions: () => ({ data: mockFixture, refetch: jest.fn() }),
  reportMissionEvent: (...args: unknown[]) => mockReport(...(args as [])),
}));
jest.mock('./api/useRedeem', () => ({
  useRedeem: () => ({ isPending: mockPending, mutateAsync: mockRedeem }),
}));
jest.mock('@/features/subscription/api/queries', () => ({ useIsPro: () => mockIsPro }));
jest.mock('@/features/board/api/queries', () => ({
  useScanCredits: () => ({ data: { available: 4 } }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/i18n', () => ({ useAppLanguage: () => 'en' }));
jest.mock('@/ui/components/AppSheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    AppSheet: React.forwardRef(function MockSheet(
      props: {
        onChange?: (index: number) => void;
        onDismiss?: () => void;
        children: React.ReactNode;
        footer?: React.ReactNode;
      },
      ref,
    ) {
      React.useImperativeHandle(ref, () => ({
        present: () => props.onChange?.(0),
        dismiss: () => {
          mockDismissals.push(props.onDismiss ?? (() => undefined));
        },
      }));
      return (
        <>
          {props.children}
          {props.footer}
        </>
      );
    }),
    DismissButton: () => null,
  };
});
async function mount() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MissionsScreen />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  mockDismissals.length = 0;
  mockIsPro = false;
  mockPending = false;
});
it('keeps the sheet open while a redemption is running', async () => {
  mockPending = true;
  const screen = await mount();
  await fireEvent.press(screen.getByText('Get Unlimited Access'));
  await fireEvent.press(screen.getByTestId('mission-first_board'));
  expect(mockDismissals).toHaveLength(0);
  expect(mockReplace).not.toHaveBeenCalled();
});
it('reports the source once and waits for main-sheet dismissal before navigating', async () => {
  const screen = await mount();
  expect(mockReport).toHaveBeenCalledWith(
    { event: 'missions_sheet_viewed', source: 'profile' },
    expect.anything(),
  );
  await fireEvent.press(screen.getByTestId('mission-first_board'));
  expect(mockReplace).not.toHaveBeenCalled();
  await act(() => mockDismissals.shift()!());
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)/board');
  expect(mockReport).toHaveBeenCalledTimes(1);
});
it('blocks Pro redemption with the source alert and ignores exhausted rewards', async () => {
  mockIsPro = true;
  const alert = jest.spyOn(Alert, 'alert');
  const screen = await mount();
  await fireEvent.press(screen.getByTestId('reward-pro_7d'));
  expect(alert).toHaveBeenCalledWith(
    "You're already Pro",
    'You can redeem Pro rewards after your current Pro subscription expires.',
  );
  expect(screen.getByTestId('reward-pro_30d')).toBeDisabled();
  expect(mockRedeem).not.toHaveBeenCalled();
});
it('guards duplicate taps and presents success only after redemption-sheet dismissal', async () => {
  let finish!: (value: unknown) => void;
  mockRedeem.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const screen = await mount();
  await fireEvent.press(screen.getByTestId('reward-scan_credit_1'));
  await fireEvent.press(screen.getByTestId('missions-redeem'));
  await fireEvent.press(screen.getByTestId('missions-redeem'));
  expect(mockRedeem).toHaveBeenCalledTimes(1);
  await act(() => finish({ confirmed: [{ itemId: 'scan_credit_1', price: 30, newBalance: 90 }] }));
  expect(screen.queryByText('Claimed 1 Scan credit')).toBeNull();
  await act(() => mockDismissals.shift()!());
  expect(screen.getByText('Claimed 1 Scan credit')).toBeTruthy();
  await fireEvent.press(screen.getByText('Scan a video'));
  expect(mockReplace).not.toHaveBeenCalled();
  await act(() => mockDismissals.shift()!());
  expect(mockReplace).not.toHaveBeenCalled();
  await act(() => mockDismissals.shift()!());
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)/board');
});
