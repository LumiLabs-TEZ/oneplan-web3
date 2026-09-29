import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import { QuickActionsMenu } from './QuickActionsMenu';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

let mockIsPro = false;
jest.mock('@/features/me/useMe', () => ({ useIsPro: () => mockIsPro }));

describe('QuickActionsMenu', () => {
  afterEach(() => {
    jest.clearAllMocks();
    mockIsPro = false;
  });

  it('scanQR pushes /profile/invite with scan=1', async () => {
    const onClose = jest.fn();
    const screen = await render(<QuickActionsMenu onClose={onClose} />);
    fireEvent.press(screen.getByTestId('quick-scanQR'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/profile/invite',
      params: { scan: '1' },
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('newTrip pushes /trip/new', async () => {
    const screen = await render(<QuickActionsMenu onClose={jest.fn()} />);
    fireEvent.press(screen.getByTestId('quick-newTrip'));
    expect(router.push).toHaveBeenCalledWith('/trip/new');
  });

  it('newTrip at the free planning-trip cap pushes /paywall instead of /trip/new', async () => {
    mockIsPro = false;
    const screen = await render(<QuickActionsMenu onClose={jest.fn()} planningTripCount={3} />);
    fireEvent.press(screen.getByTestId('quick-newTrip'));
    expect(router.push).toHaveBeenCalledWith('/paywall');
  });

  it('shows a Pro badge on the uploadTrip row', async () => {
    const screen = await render(<QuickActionsMenu onClose={jest.fn()} />);
    expect(screen.getByTestId('quick-uploadTrip-badge')).toBeTruthy();
  });

  it('uploadTrip (Pro-only, not Pro) is non-interactive: the gated row itself does nothing', async () => {
    mockIsPro = false;
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = await render(<QuickActionsMenu onClose={jest.fn()} />);
    fireEvent.press(screen.getByTestId('quick-uploadTrip'));
    expect(router.push).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('uploadTrip (not Pro) shows the PremiumGate overlay, and tapping it closes the FAB and pushes /paywall', async () => {
    mockIsPro = false;
    const onClose = jest.fn();
    const screen = await render(<QuickActionsMenu onClose={onClose} />);
    fireEvent.press(screen.getByTestId('premium-gate'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/paywall');
  });

  it('uploadTrip (Pro) opens the creator editor', async () => {
    mockIsPro = true;
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = await render(<QuickActionsMenu onClose={jest.fn()} />);
    expect(screen.queryByTestId('premium-gate')).toBeNull();
    fireEvent.press(screen.getByTestId('quick-uploadTrip'));
    expect(router.push).toHaveBeenCalledWith('/market/editor');
  });
});
