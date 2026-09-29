import { fireEvent, render, screen } from '@testing-library/react-native';

import type { TripNoteDto } from '../types';
import { NoteCardRow } from './NoteCardRow';

function note(overrides: Partial<TripNoteDto> = {}): TripNoteDto {
  return {
    id: 1,
    tripId: 1,
    createdById: 1,
    title: 'Pack sunscreen',
    body: 'Buy SPF 50',
    isDone: false,
    createdAt: '2026-05-15T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('NoteCardRow', () => {
  it('renders title, body and the dd/MM date label', async () => {
    await render(<NoteCardRow note={note()} onEditPress={jest.fn()} onToggle={jest.fn()} />);
    expect(screen.getByText('Pack sunscreen')).toBeTruthy();
    expect(screen.getByText('Buy SPF 50')).toBeTruthy();
    expect(screen.getByText('15/05')).toBeTruthy();
  });

  it('fires onEditPress when the card is tapped', async () => {
    const onEditPress = jest.fn();
    await render(
      <NoteCardRow note={note()} onEditPress={onEditPress} onToggle={jest.fn()} testID="card" />,
    );
    await fireEvent.press(screen.getByTestId('card'));
    expect(onEditPress).toHaveBeenCalledTimes(1);
  });

  it('fires onToggle (not onEditPress) when the checkbox is tapped', async () => {
    const onEditPress = jest.fn();
    const onToggle = jest.fn();
    await render(
      <NoteCardRow
        note={note()}
        onEditPress={onEditPress}
        onToggle={onToggle}
        testID="card"
        checkboxTestID="card-checkbox"
      />,
    );
    await fireEvent.press(screen.getByTestId('card-checkbox'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onEditPress).not.toHaveBeenCalled();
  });

  it('disables card-tap-to-edit and the checkbox when canEdit is false', async () => {
    const onEditPress = jest.fn();
    const onToggle = jest.fn();
    await render(
      <NoteCardRow
        note={note()}
        onEditPress={onEditPress}
        onToggle={onToggle}
        canEdit={false}
        testID="card"
        checkboxTestID="card-checkbox"
      />,
    );

    await fireEvent.press(screen.getByTestId('card'));
    expect(onEditPress).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('card-checkbox'));
    expect(onToggle).not.toHaveBeenCalled();
  });
});
