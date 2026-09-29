/**
 * Lives outside `src/app/` on purpose — expo-router's typed-route generator treats every file
 * under the app root as a route (same reasoning as `sendFriendRequestScreen.test.tsx`).
 *
 * Covers the M6.2 simulator finding: `/profile/invite` renders inside a `headerShown: false`
 * stack and its pull-to-reveal `Gesture.Pan()` swallows the iOS interactive-pop edge swipe, so
 * without an explicit back button the screen is a dead end (Maestro's `- back` never popped it).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { initI18n } from '@/i18n';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  router: { back: (...args: unknown[]) => mockBack(...args), push: jest.fn() },
  useIsFocused: () => true,
  useLocalSearchParams: () => ({}),
}));

jest.mock('@/features/me/useMe', () => ({
  useMe: () => ({
    data: { displayName: 'Spike Tester', avatarUrl: null, friendCode: 'a'.repeat(64) },
  }),
}));

jest.mock('@/features/friends/api/queries', () => ({
  useFriends: () => ({ data: [], isLoading: false }),
  mutualLabel: () => '',
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ProfileInviteScreen = require('@/app/profile/invite').default as () => ReactNode;

/** `SafeAreaProvider` never measures under Jest, so the screen needs seeded metrics. */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={qc}>
        <ProfileInviteScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeAll(() => {
  initI18n();
});

beforeEach(() => {
  mockBack.mockClear();
});

describe('ProfileInviteScreen', () => {
  it('renders a back button so the screen is not a dead end', async () => {
    await renderScreen();
    expect(screen.getByTestId('invite-back')).toBeTruthy();
  });

  it('pops the stack when the back button is pressed', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId('invite-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
