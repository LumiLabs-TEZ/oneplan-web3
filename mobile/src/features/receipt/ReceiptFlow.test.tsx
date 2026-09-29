import { act, fireEvent, render } from '@testing-library/react-native';
import { onlineManager } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Alert, Pressable as MockPressable, Text as MockText } from 'react-native';
import ReceiptScanScreen from '@/app/trip/[tripId]/expense/scan';
import type { ReceiptCamera } from '@/native/camera/ReceiptCamera';
import { ReceiptFlow } from './ReceiptFlow';
import { assignmentReducer as mockAssignmentReducer } from './assignment';
import fixture from './fixtures/receipt.json';

const mockCameraProps = jest.fn();
const mockAssignmentProps = jest.fn();
const mockScan = jest.fn();
const mockSave = jest.fn();
jest.mock('./api/mutations', () => ({
  useScanReceipt: () => ({ mutateAsync: mockScan }),
  useCreateReceiptExpense: () => ({ mutateAsync: mockSave }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(),
  router: { back: jest.fn(), dismissTo: jest.fn() },
}));
jest.mock('@/features/subscription/useRequirePro', () => ({
  useRequirePro: () => ({ requirePro: (allowed: () => void) => allowed() }),
}));
jest.mock('@/features/trip/TripDetailContext', () => ({
  useTripDetail: () => ({
    tripId: 5,
    trip: { currency: 'USD', localCurrencies: ['THB'] },
    members: mockMembers,
  }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (s: string) => s }) }));
jest.mock('@/i18n', () => ({ useAppLanguage: jest.fn() }));
jest.mock('@/native/camera/receiptImage', () => ({ prepareReceiptPhoto: async (p: unknown) => p }));
jest.mock('@/native/camera/ReceiptCamera', () => ({
  ReceiptCamera: (props: React.ComponentProps<typeof ReceiptCamera>) => (
    mockCameraProps(props),
    (
      <MockPressable
        testID="capture"
        onPress={() => props.onPhoto({ uri: 'file:///test.jpg', width: 10, height: 10 })}
      >
        <MockText>Capture</MockText>
      </MockPressable>
    )
  ),
}));
jest.mock('./components/ReceiptAssignment', () => ({
  ReceiptAssignment: ({
    initialState,
    restaurantName,
    onConfirm,
    onBack,
  }: {
    initialState: Parameters<typeof mockAssignmentReducer>[0];
    restaurantName: string;
    onConfirm: (state: Parameters<typeof mockAssignmentReducer>[0]) => void;
    onBack: () => void;
  }) => (
    mockAssignmentProps({ initialState, restaurantName, onConfirm }),
    (
      <>
        <MockPressable
          testID="confirm"
          onPress={() =>
            onConfirm(
              mockAssignmentReducer(initialState, {
                type: 'assign',
                itemId: initialState.items[0]!.id,
                memberIds: [initialState.members[0]!.id],
              }),
            )
          }
        >
          <MockText>Confirm</MockText>
        </MockPressable>
        <MockPressable testID="retake" onPress={onBack}>
          <MockText>Retake</MockText>
        </MockPressable>
      </>
    )
  ),
}));
const mockMembers = fixture.members.map((m) => ({
  id: m.userId,
  userId: m.userId,
  displayName: m.name,
  inviteStatus: 'ACCEPTED' as const,
  role: 'MEMBER' as const,
  isPro: false,
}));
const allow = (cb: () => void) => cb();
const props = {
  tripId: 5,
  members: mockMembers,
  localCurrency: 'THB',
  homeCurrency: 'USD',
  onDismiss: jest.fn(),
  onSaved: jest.fn(),
  requirePro: allow,
};
beforeEach(() => {
  jest.clearAllMocks();
  onlineManager.setOnline(true);
  mockScan.mockResolvedValue(fixture.receipt);
  mockSave.mockResolvedValue({ id: 1 });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
it('captures, assigns, saves partial receipt, and reports success once', async () => {
  const view = await render(<ReceiptFlow {...props} />);
  await fireEvent.press(view.getByTestId('capture'));
  await fireEvent.press(view.getByTestId('confirm'));
  expect(mockSave).toHaveBeenCalledWith(
    expect.objectContaining({
      category: 'FOOD',
      originalCurrency: 'THB',
      items: [{ name: 'Chicken rice', amount: 50, userId: 1 }],
    }),
  );
  expect(props.onSaved).toHaveBeenCalledTimes(1);
  expect(props.onDismiss).not.toHaveBeenCalled();
});
it('dismisses capture without reporting a successful save', async () => {
  const view = await render(<ReceiptFlow {...props} />);
  await fireEvent.press(view.getByLabelText('Back'));
  expect(props.onDismiss).toHaveBeenCalledTimes(1);
  expect(props.onSaved).not.toHaveBeenCalled();
});
it('retakes from assignment and empty results', async () => {
  const view = await render(<ReceiptFlow {...props} />);
  await fireEvent.press(view.getByTestId('capture'));
  await fireEvent.press(view.getByTestId('retake'));
  expect(view.getByTestId('capture')).toBeTruthy();
  mockScan.mockResolvedValueOnce({ items: [] });
  await fireEvent.press(view.getByTestId('capture'));
  expect(Alert.alert).toHaveBeenLastCalledWith(
    'Error',
    'No items detected in the receipt.',
    expect.any(Array),
    { cancelable: false },
  );
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)![2]!;
  await act(() => buttons[0]!.onPress!());
  expect(view.getByTestId('capture')).toBeTruthy();
});
it('blocks offline scan and save, and checks Pro before requests', async () => {
  const view = await render(<ReceiptFlow {...props} />);
  onlineManager.setOnline(false);
  await fireEvent.press(view.getByTestId('capture'));
  expect(mockScan).not.toHaveBeenCalled();
  onlineManager.setOnline(true);
  await fireEvent.press(view.getByTestId('capture'));
  onlineManager.setOnline(false);
  await fireEvent.press(view.getByTestId('confirm'));
  expect(mockSave).not.toHaveBeenCalled();
  onlineManager.setOnline(true);
  await view.unmount();
  const gate = jest.fn();
  const denied = await render(<ReceiptFlow {...props} requirePro={gate} />);
  await fireEvent.press(denied.getByTestId('capture'));
  expect(gate).toHaveBeenCalled();
  expect(mockScan).toHaveBeenCalledTimes(1);
});
it('keeps failures visible and retakes after save failure', async () => {
  mockSave.mockRejectedValueOnce(new Error('failure'));
  const view = await render(<ReceiptFlow {...props} />);
  await fireEvent.press(view.getByTestId('capture'));
  await fireEvent.press(view.getByTestId('confirm'));
  expect(props.onDismiss).not.toHaveBeenCalled();
  expect(props.onSaved).not.toHaveBeenCalled();
  expect(view.getByTestId('confirm')).toBeTruthy();
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)![2]!;
  await act(() => buttons[0]!.onPress!());
  expect(view.getByTestId('capture')).toBeTruthy();
});
it('guards duplicate submissions, shows saving, then returns to Trip Detail on success', async () => {
  let resolveScan!: (result: typeof fixture.receipt) => void;
  mockScan.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveScan = resolve;
      }),
  );
  const view = await render(<ReceiptScanScreen />);
  const capture = () =>
    mockCameraProps.mock.calls
      .at(-1)![0]
      .onPhoto({ uri: 'file:///test.jpg', width: 10, height: 10 });
  await act(() => {
    capture();
    capture();
  });
  expect(mockScan).toHaveBeenCalledTimes(1);
  await act(() => resolveScan(fixture.receipt));
  let resolveSave!: () => void;
  mockSave.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        resolveSave = resolve;
      }),
  );
  const assignment = mockAssignmentProps.mock.calls.at(-1)![0];
  const state = mockAssignmentReducer(assignment.initialState, {
    type: 'assign',
    itemId: assignment.initialState.items[0].id,
    memberIds: [assignment.initialState.members[0].id],
  });
  const confirm = () => assignment.onConfirm(state);
  await act(() => {
    confirm();
    confirm();
  });
  expect(mockSave).toHaveBeenCalledTimes(1);
  expect(view.getByText('Creating expense...')).toBeTruthy();
  expect(view.queryByTestId('confirm')).toBeNull();
  expect(router.dismissTo).not.toHaveBeenCalled();
  expect(router.back).not.toHaveBeenCalled();
  await act(() => resolveSave());
  expect(router.dismissTo).toHaveBeenCalledTimes(1);
  expect(router.dismissTo).toHaveBeenCalledWith({
    pathname: '/trip/[tripId]',
    params: { tripId: '5' },
  });
  expect(router.back).not.toHaveBeenCalled();
});
it('treats an all-discount receipt as no items and clamps the scanned restaurant name', async () => {
  mockScan.mockResolvedValueOnce({
    restaurantName: 'r'.repeat(300),
    items: [{ name: 'Discount', quantity: 1, unitPrice: -5, totalPrice: -5 }],
  });
  const view = await render(<ReceiptFlow {...props} />);
  await fireEvent.press(view.getByTestId('capture'));
  expect(Alert.alert).toHaveBeenCalledWith(
    'Error',
    'No items detected in the receipt.',
    expect.anything(),
    expect.anything(),
  );
  expect(mockAssignmentProps).not.toHaveBeenCalled();
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)![2]!;
  await act(() => buttons[0]!.onPress!());
  mockScan.mockResolvedValueOnce({ ...fixture.receipt, restaurantName: 'r'.repeat(300) });
  await fireEvent.press(view.getByTestId('capture'));
  expect(mockAssignmentProps.mock.calls.at(-1)![0].restaurantName).toHaveLength(255);
});
