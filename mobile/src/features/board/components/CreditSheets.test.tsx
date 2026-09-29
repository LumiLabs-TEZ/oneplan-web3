import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, fireEvent, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { initI18n } from '@/i18n';
import { CreditSheets } from './CreditSheets';
import { purchaseScanCredits } from '@/iap/StoreService';
jest.mock('@/iap/StoreService', () => ({
  loadProducts: jest.fn(async () => undefined),
  purchaseScanCredits: jest.fn(),
  reconcilePending: jest.fn(),
}));
jest.mock('@/iap/useStore', () => ({
  useStore: (select: (state: unknown) => unknown) =>
    select({
      products: {
        packs: [1, 5, 15, 30].map((count) => ({
          id: `oneplan.video_scan_${count}`,
          title: `${count} scans`,
          displayPrice: `$${count}`,
        })),
      },
      purchasing: false,
      hasPendingRetry: false,
      error: null,
    }),
}));
jest.mock('@/features/me/useMe', () => ({ useMe: () => ({ data: { id: 1 } }) }));
jest.mock('@/features/subscription/api/queries', () => ({ useIsPro: () => false }));
jest.mock('../api/queries', () => ({ useScanCredits: () => ({ data: { available: 0 } }) }));
jest.mock('@/offline/guardOnline', () => ({ requireOnline: () => true }));
jest.mock('./common', () => ({
  ...jest.requireActual('./common'),
  BoardSheet: ({ children, footer }: { children: ReactNode; footer?: ReactNode }) => (
    <>
      {children}
      {footer}
    </>
  ),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
it('selects before purchasing, keeps cancellation open, and closes only after a validated purchase', async () => {
  initI18n();
  const close = jest.fn();
  const client = new QueryClient();
  (purchaseScanCredits as jest.Mock)
    .mockResolvedValueOnce('cancelled')
    .mockResolvedValueOnce('purchased');
  await render(
    <QueryClientProvider client={client}>
      <CreditSheets onClose={close} />
    </QueryClientProvider>,
  );
  await fireEvent.press(screen.getByTestId('scan-pack-oneplan.video_scan_5'));
  expect(purchaseScanCredits).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId('scan-pack-buy'));
  expect(purchaseScanCredits).toHaveBeenCalledWith('oneplan.video_scan_5');
  expect(close).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId('scan-pack-buy'));
  expect(close).toHaveBeenCalledTimes(1);
  client.clear();
});
