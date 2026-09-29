/**
 * Final-review M2: every web3-only route must be absent (not merely hidden) when the flag is off,
 * so a stale or hand-typed `oneplan://` link cannot open vault UI or fire its API calls in prod.
 * `Stack` is replaced by a stand-in that renders only the screens whose `Stack.Protected` guard is
 * open, which is exactly the set expo-router would register.
 */
import { render } from '@testing-library/react-native';

let mockWeb3Enabled = false;
jest.mock('@/features/vault/web3Flag', () => ({ useWeb3Enabled: () => mockWeb3Enabled }));

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  const Stack = Object.assign(
    function Stack({ children }: { children?: unknown }) {
      return React.createElement(React.Fragment, null, children);
    },
    {
      Screen: function Screen({ name }: { name: string }) {
        return React.createElement(Text, { testID: `screen:${name}` }, name);
      },
      Protected: function Protected({ guard, children }: { guard: boolean; children?: unknown }) {
        return guard ? React.createElement(React.Fragment, null, children) : null;
      },
    },
  );
  return { Stack, useLocalSearchParams: () => ({ tripId: '5' }) };
});
jest.mock('@/features/trip/api/queries', () => ({ useTrips: () => ({ data: [] }) }));
jest.mock('@/features/trip/TripDetailContext', () => {
  const React = jest.requireActual('react');
  return {
    TripDetailProvider: function TripDetailProvider({ children }: { children: unknown }) {
      return React.createElement(React.Fragment, null, children);
    },
  };
});
jest.mock('@gorhom/bottom-sheet', () => {
  const React = jest.requireActual('react');
  return {
    BottomSheetModalProvider: function BottomSheetModalProvider({ children }: { children: unknown }) {
      return React.createElement(React.Fragment, null, children);
    },
  };
});

// eslint-disable-next-line import/first -- must follow the jest.mock hoists
import { Stack } from 'expo-router';
// eslint-disable-next-line import/first -- must follow the jest.mock hoists
import ProfileLayout from '@/app/profile/_layout';
// eslint-disable-next-line import/first -- must follow the jest.mock hoists
import TripDetailLayout from '@/app/trip/[tripId]/_layout';
// eslint-disable-next-line import/first -- must follow the jest.mock hoists
import { web3RootScreens } from './web3RootScreens';

const TRIP_WEB3_SCREENS = [
  'end-review',
  'end-waiting',
  'end-denied',
  'vault/pay',
  'vault/deposit-result',
];

describe('web3 route guards (M2)', () => {
  it.each(TRIP_WEB3_SCREENS)('trip route %s does not exist with the flag off', async (name) => {
    mockWeb3Enabled = false;
    const screen = await render(<TripDetailLayout />);
    expect(screen.queryByTestId(`screen:${name}`)).toBeNull();
    // The classic trip routes are untouched.
    expect(screen.getByTestId('screen:end')).toBeTruthy();
    expect(screen.getByTestId('screen:expense/new')).toBeTruthy();
  });

  it.each(TRIP_WEB3_SCREENS)('trip route %s exists with the flag on', async (name) => {
    mockWeb3Enabled = true;
    const screen = await render(<TripDetailLayout />);
    expect(screen.getByTestId(`screen:${name}`)).toBeTruthy();
  });

  it('profile/wallet only exists with the flag on', async () => {
    mockWeb3Enabled = false;
    const off = await render(<ProfileLayout />);
    expect(off.queryByTestId('screen:wallet')).toBeNull();
    expect(off.getByTestId('screen:settings')).toBeTruthy();
    await off.unmount();

    mockWeb3Enabled = true;
    const on = await render(<ProfileLayout />);
    expect(on.getByTestId('screen:wallet')).toBeTruthy();
  });

  it.each(['how-money-is-held', 'web3-welcome', 'wallet/deposit'])(
    'root route %s only exists with the flag on',
    async (name) => {
      const off = await render(<Stack>{web3RootScreens(false)}</Stack>);
      expect(off.queryByTestId(`screen:${name}`)).toBeNull();
      await off.unmount();

      const on = await render(<Stack>{web3RootScreens(true)}</Stack>);
      expect(on.getByTestId(`screen:${name}`)).toBeTruthy();
    },
  );
});
