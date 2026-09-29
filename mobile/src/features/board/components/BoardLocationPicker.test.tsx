import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { initI18n } from '@/i18n';
import { BoardAddSpotsButton, BoardLocationPicker } from './BoardLocationPicker';
import type { BoardPin } from '../types';

jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('../api/queries', () => ({
  useBoards: () => ({
    data: [{ id: 7, title: 'Da Lat', pinCount: 2, locationLabel: 'Đà Lạt', coverUrls: [] }],
    isPending: false,
    isError: false,
  }),
  useBoard: (id: number) => ({
    data: id
      ? {
          id,
          pins: [
            { id: 1, boardId: id, name: 'Buôn Kơ Lang', sortOrder: 0, createdAt: '' },
            { id: 2, boardId: id, name: 'Air dream 2', sortOrder: 1, createdAt: '' },
          ],
        }
      : undefined,
    isPending: !id,
    isError: false,
  }),
}));

beforeAll(() => initI18n());

/** Mirrors `LocationSheet`: owns the open board + selection and renders the footer button. */
function Host({
  initialBoard,
  onBulk,
}: {
  initialBoard: number;
  onBulk: (pins: BoardPin[]) => void;
}) {
  const [boardId, setBoardId] = useState(initialBoard);
  const [pins, setPins] = useState<BoardPin[]>([]);
  return (
    <>
      <BoardLocationPicker
        boardId={boardId}
        onBoardChange={setBoardId}
        selectedPins={pins}
        onSelectedPinsChange={setPins}
        onPick={jest.fn()}
      />
      {boardId && pins.length ? (
        <BoardAddSpotsButton count={pins.length} onPress={() => onBulk(pins)} />
      ) : null}
    </>
  );
}

it('opens a board from Saved Boards', async () => {
  await render(<Host initialBoard={0} onBulk={jest.fn()} />);
  await fireEvent.press(screen.getByText('Da Lat'));
  expect(screen.getByTestId('board-find-spot')).toBeTruthy();
});

it('selects all pins, adds them, and goes back', async () => {
  const onBulk = jest.fn();
  await render(<Host initialBoard={7} onBulk={onBulk} />);
  expect(screen.queryByTestId('board-add-spots')).toBeNull();
  await fireEvent.press(screen.getByTestId('board-select-all'));
  expect(screen.getByText('Deselect all')).toBeTruthy();
  await fireEvent.press(screen.getByText('Add 2 spots'));
  expect(onBulk).toHaveBeenCalledWith([
    expect.objectContaining({ id: 1 }),
    expect.objectContaining({ id: 2 }),
  ]);
  await fireEvent.press(screen.getByTestId('board-pins-back'));
  expect(screen.getByText('Saved Boards')).toBeTruthy();
  expect(screen.queryByTestId('board-add-spots')).toBeNull();
});
