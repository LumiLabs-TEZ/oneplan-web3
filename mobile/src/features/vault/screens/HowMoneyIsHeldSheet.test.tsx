import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { initI18n } from '@/i18n';

jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));

const mockVaultWalletKind = jest.fn<'privy' | 'mwa' | null, []>(() => 'privy');
jest.mock('../wallet/walletHandle', () => ({ vaultWalletKind: () => mockVaultWalletKind() }));

// eslint-disable-next-line import/first -- must follow the jest.mock hoist
import { HowMoneyIsHeldSheet } from './HowMoneyIsHeldSheet';
// eslint-disable-next-line import/first
import { HOW_MONEY_IS_HELD_SECTIONS, HOW_MONEY_IS_HELD_SECTIONS_MWA } from '../howMoneyIsHeldCopy';

/** `SafeAreaProvider` never measures under Jest, so the screen needs seeded metrics. */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function wrapper({ children }: { children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>;
}

describe('HowMoneyIsHeldSheet', () => {
  beforeAll(() => {
    initI18n();
  });

  beforeEach(() => {
    mockVaultWalletKind.mockReturnValue('privy');
  });

  it('iOS (Privy) keeps the Privy custody copy verbatim', async () => {
    const screen = await render(<HowMoneyIsHeldSheet />, { wrapper });
    for (const section of HOW_MONEY_IS_HELD_SECTIONS) {
      for (const key of section.paragraphKeys) expect(screen.getByText(key)).toBeTruthy();
    }
    expect(screen.queryAllByText(/wallet provider, Privy/)).toHaveLength(1);
  });

  it('Android (MWA) explains the member’s own wallet app holds the keys, never Privy', async () => {
    mockVaultWalletKind.mockReturnValue('mwa');
    const screen = await render(<HowMoneyIsHeldSheet />, { wrapper });
    expect(
      screen.getByText(
        'You connect your own Solana wallet app, such as Phantom, Solflare or Seed Vault. Your keys stay in that app, and OnePlan never holds them. Your wallet holds USDC, a dollar-backed stablecoin, on the Solana network.',
      ),
    ).toBeTruthy();
    expect(screen.queryAllByText(/Privy/)).toHaveLength(0);
    expect(screen.queryAllByText(/wallet provider/)).toHaveLength(0);
    expect(screen.queryAllByText(/key export/)).toHaveLength(0);
    // Shared, custody-neutral sections are unchanged.
    expect(screen.getByText('We pay the network fees')).toBeTruthy();
  });

  it('the MWA copy only swaps paragraphs: same sections, titles and bullets', () => {
    expect(HOW_MONEY_IS_HELD_SECTIONS_MWA.map((s) => [s.id, s.titleKey, s.bulletKeys])).toEqual(
      HOW_MONEY_IS_HELD_SECTIONS.map((s) => [s.id, s.titleKey, s.bulletKeys]),
    );
  });

  it('renders the title and every section title verbatim', async () => {
    const screen = await render(<HowMoneyIsHeldSheet />, { wrapper });
    expect(screen.getByText('How your money is held?')).toBeTruthy();
    for (const section of HOW_MONEY_IS_HELD_SECTIONS) {
      if (section.titleKey) expect(screen.getByText(section.titleKey)).toBeTruthy();
    }
  });

  it('has no close button — the sheet grabber dismisses it', async () => {
    const screen = await render(<HowMoneyIsHeldSheet />, { wrapper });
    expect(screen.queryByTestId('how-money-is-held-close')).toBeNull();
  });
});
