import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, fireEvent, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { initI18n } from '@/i18n';
import { GenerateTripSheet } from './GenerateTripSheet';
import { generateTrip } from '../api/mutations';
import type { Board } from '../types';
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../api/mutations', () => ({
  generateTrip: jest.fn(async () => ({ id: 10 })),
  updateBoard: jest.fn(),
}));
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
const board: Board = {
  id: 1,
  title: 'Weekend',
  countryId: 2,
  createdAt: '',
  updatedAt: '',
  pins: Array.from({ length: 5 }, (_, i) => ({
    id: i + 1,
    boardId: 1,
    name: `Place ${i + 1}`,
    sortOrder: i,
    createdAt: '',
  })),
};
it('requires explicit pin selection, derives days, and sends gap filling off', async () => {
  initI18n();
  const generated = jest.fn();
  const client = new QueryClient();
  await render(
    <QueryClientProvider client={client}>
      <GenerateTripSheet board={board} onClose={() => undefined} onGenerated={generated} />
    </QueryClientProvider>,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Generate trip' }));
  expect(generateTrip).not.toHaveBeenCalled();
  for (const pin of board.pins) await fireEvent.press(screen.getByText(pin.name));
  expect(screen.getByText('2 days')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Add a day' }));
  await fireEvent.press(screen.getByText('Place 5'));
  expect(screen.getByText('3 days')).toBeTruthy();
  // Board pins: Generate opens the vibe step; the chosen vibes ride along.
  await fireEvent.press(screen.getByTestId('generate-trip-submit'));
  expect(generateTrip).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId('trip-vibe-NIGHTLIFE'));
  await fireEvent.press(screen.getByTestId('trip-vibe-confirm'));
  expect(generateTrip).toHaveBeenCalledWith(1, {
    tripName: 'Weekend',
    pinIds: [1, 2, 3, 4],
    dayCount: 3,
    fillGaps: false,
    vibes: ['NIGHTLIFE'],
  });
  expect(generated).toHaveBeenCalledWith(10);
  client.clear();
});
it('skips the vibe step for pins from a single extraction', async () => {
  initI18n();
  jest.mocked(generateTrip).mockClear();
  const client = new QueryClient();
  await render(
    <QueryClientProvider client={client}>
      <GenerateTripSheet
        board={board}
        asksForVibe={false}
        onClose={() => undefined}
        onGenerated={() => undefined}
      />
    </QueryClientProvider>,
  );
  await fireEvent.press(screen.getByText('Place 1'));
  await fireEvent.press(screen.getByTestId('generate-trip-submit'));
  expect(screen.queryByTestId('trip-vibe-confirm')).toBeNull();
  expect(generateTrip).toHaveBeenCalledWith(1, {
    tripName: 'Weekend',
    pinIds: [1],
    dayCount: 1,
    fillGaps: false,
  });
  client.clear();
});
