import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import type { BoardSummary } from '@/features/board/types';
import { initI18n } from '@/i18n';

import { YourBoardsSection } from './YourBoardsSection';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

function board(id: number): BoardSummary {
  return {
    id,
    title: `Board ${id}`,
    pinCount: id,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

beforeAll(() => {
  initI18n();
});

describe('YourBoardsSection', () => {
  it('renders nothing when there are no boards', async () => {
    const { toJSON } = await render(<YourBoardsSection boards={[]} onSeeAll={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });

  it('renders every board, not a truncated preview', async () => {
    const boards = [board(1), board(2), board(3), board(4)];
    await render(<YourBoardsSection boards={boards} onSeeAll={jest.fn()} />);
    expect(screen.getByText('Your Boards')).toBeTruthy();
    expect(screen.getByTestId('board-row-1')).toBeTruthy();
    expect(screen.getByTestId('board-row-4')).toBeTruthy();
  });

  it('pushes the board detail route when a row is pressed', async () => {
    await render(<YourBoardsSection boards={[board(7)]} onSeeAll={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('board-row-7'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/board/[boardId]',
      params: { boardId: 7 },
    });
  });

  it('reports "See all"', async () => {
    const onSeeAll = jest.fn();
    await render(<YourBoardsSection boards={[board(1)]} onSeeAll={onSeeAll} />);
    await fireEvent.press(screen.getByText('See all'));
    expect(onSeeAll).toHaveBeenCalledTimes(1);
  });
});
