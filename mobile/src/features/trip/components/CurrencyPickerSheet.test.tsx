import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { initI18n } from '@/i18n';

import { CurrencyPickerSheet } from './CurrencyPickerSheet';

// The catalog query would hit the network; leave `data` empty so the sheet renders the static
// `CURRENCY_CATALOG_FALLBACK` (exactly what an offline device sees).
jest.mock('@/features/currency/api/queries', () => ({
  ...jest.requireActual('@/features/currency/api/queries'),
  useCurrencies: () => ({ data: undefined }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('CurrencyPickerSheet', () => {
  beforeAll(() => {
    initI18n();
  });

  it('lists the static catalog and hides None by default', async () => {
    const screen = await render(<CurrencyPickerSheet selected="VND" onConfirm={jest.fn()} />, {
      wrapper,
    });
    expect(screen.getByTestId('currency-row-VND')).toBeTruthy();
    expect(screen.getByTestId('currency-row-USD')).toBeTruthy();
    expect(screen.queryByTestId('currency-row-none')).toBeNull();
  });

  it('shows the None row when showsNoneOption is set', async () => {
    const screen = await render(
      <CurrencyPickerSheet selected={null} showsNoneOption onConfirm={jest.fn()} />,
      { wrapper },
    );
    expect(screen.getByTestId('currency-row-none')).toBeTruthy();
    expect(screen.getByText('No local currency')).toBeTruthy();
  });

  it('confirms the tapped code', async () => {
    const onConfirm = jest.fn();
    const screen = await render(<CurrencyPickerSheet selected="VND" onConfirm={onConfirm} />, {
      wrapper,
    });
    await fireEvent.press(screen.getByTestId('currency-row-THB'));
    await fireEvent.press(screen.getByTestId('currency-confirm'));
    expect(onConfirm).toHaveBeenCalledWith('THB');
  });

  it('confirms null from the None row', async () => {
    const onConfirm = jest.fn();
    const screen = await render(
      <CurrencyPickerSheet selected="THB" showsNoneOption onConfirm={onConfirm} />,
      { wrapper },
    );
    await fireEvent.press(screen.getByTestId('currency-row-none'));
    await fireEvent.press(screen.getByTestId('currency-confirm'));
    expect(onConfirm).toHaveBeenCalledWith(null);
  });

  it('does not confirm when dismissed', async () => {
    const onConfirm = jest.fn();
    const screen = await render(<CurrencyPickerSheet selected="VND" onConfirm={onConfirm} />, {
      wrapper,
    });
    await fireEvent.press(screen.getByTestId('currency-row-USD'));
    await fireEvent.press(screen.getByTestId('currency-dismiss'));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
