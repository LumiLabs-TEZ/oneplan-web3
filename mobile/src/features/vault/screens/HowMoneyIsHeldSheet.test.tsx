import { fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { initI18n } from '@/i18n';

jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));

// eslint-disable-next-line import/first -- must follow the jest.mock hoist
import { HowMoneyIsHeldSheet } from './HowMoneyIsHeldSheet';
// eslint-disable-next-line import/first
import { HOW_MONEY_IS_HELD_SECTIONS } from '../howMoneyIsHeldCopy';

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

  it('renders the title and every section title verbatim', async () => {
    const screen = await render(<HowMoneyIsHeldSheet onClose={jest.fn()} />, { wrapper });
    expect(screen.getByText('How your money is held?')).toBeTruthy();
    for (const section of HOW_MONEY_IS_HELD_SECTIONS) {
      if (section.titleKey) expect(screen.getByText(section.titleKey)).toBeTruthy();
    }
  });

  it('fires onClose from the close button', async () => {
    const onClose = jest.fn();
    const screen = await render(<HowMoneyIsHeldSheet onClose={onClose} />, { wrapper });
    await fireEvent.press(screen.getByTestId('how-money-is-held-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
