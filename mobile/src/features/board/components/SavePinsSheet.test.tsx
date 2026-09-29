import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, fireEvent, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { initI18n } from '@/i18n';
import { SavePinsSheet } from './SavePinsSheet';
import { createPlanItem } from '@/features/plan/api/mutations';
jest.mock('@/features/trip/api/queries', () => ({
  useTrips: () => ({
    data: [
      { id: 7, name: 'Tokyo', status: 'PLANNING' },
      { id: 8, name: 'Old trip', status: 'ENDED' },
    ],
  }),
}));
jest.mock('@/features/me/useMe', () => ({ useMe: () => ({ data: { id: 1 } }) }));
jest.mock('../api/queries', () => ({ useBoards: () => ({ data: [] }) }));
jest.mock('@/features/plan/api/mutations', () => ({
  createPlanItem: jest.fn(),
  invalidatePlanItems: jest.fn(async () => undefined),
}));
jest.mock('@/offline/guardOnline', () => ({ requireOnline: () => true }));
jest.mock('./common', () => ({
  styles: {},
  BoardSheet: ({ children }: { children: ReactNode }) => <>{children}</>,
  QueryError: () => null,
}));
it('retries only the unsaved suffix and never offers ended trips', async () => {
  initI18n();
  const saved = jest.fn();
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  (createPlanItem as jest.Mock)
    .mockResolvedValueOnce({ id: 1 })
    .mockRejectedValueOnce(new Error('Network unavailable'))
    .mockResolvedValueOnce({ id: 2 });
  await render(
    <QueryClientProvider client={client}>
      <SavePinsSheet
        target="trip"
        pins={[{ name: 'Cafe' }, { name: 'Park' }]}
        onClose={() => undefined}
        onSaved={saved}
        onGenerate={() => undefined}
      />
    </QueryClientProvider>,
  );
  expect(screen.queryByText('Old trip')).toBeNull();
  await fireEvent.press(screen.getByText('Tokyo'));
  expect(saved).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Tokyo'));
  expect(saved).toHaveBeenCalledWith(7);
  expect((createPlanItem as jest.Mock).mock.calls.map((call) => call[1].title)).toEqual([
    'Cafe',
    'Park',
    'Park',
  ]);
  client.clear();
});
