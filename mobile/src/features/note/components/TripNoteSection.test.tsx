import { fireEvent, render, screen } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import type { TripNoteDto } from '../types';
import { TripNoteSection } from './TripNoteSection';

const mockUpdateMutate = jest.fn();
const mockDeleteMutate = jest.fn();
const mockCreateMutateAsync = jest.fn();
const mockRefetch = jest.fn();

const mockNotesState: {
  data: TripNoteDto[] | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
} = {
  data: undefined,
  isPending: false,
  isError: false,
  error: null,
  refetch: mockRefetch,
};

jest.mock('../api/queries', () => ({
  useTripNotes: () => mockNotesState,
}));

jest.mock('../api/mutations', () => ({
  useCreateNote: () => ({ mutateAsync: mockCreateMutateAsync }),
  useUpdateNote: () => ({ mutate: mockUpdateMutate, mutateAsync: jest.fn() }),
  useDeleteNote: () => ({ mutate: mockDeleteMutate }),
}));

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

describe('TripNoteSection', () => {
  beforeAll(() => {
    initI18n();
  });

  beforeEach(() => {
    mockUpdateMutate.mockReset();
    mockDeleteMutate.mockReset();
    mockCreateMutateAsync.mockReset();
    mockRefetch.mockReset();
    mockNotesState.data = undefined;
    mockNotesState.isPending = false;
    mockNotesState.isError = false;
    mockNotesState.error = null;
  });

  it('shows a spinner while loading with no cached notes', async () => {
    mockNotesState.isPending = true;
    await render(<TripNoteSection tripId={1} armed canEdit />);
    expect(screen.queryByText('No notes yet')).toBeNull();
  });

  it('shows the empty state when there are no notes', async () => {
    mockNotesState.data = [];
    await render(<TripNoteSection tripId={1} armed canEdit />);
    expect(screen.getByText('No notes yet')).toBeTruthy();
    expect(screen.getByText('Add your first note to get started')).toBeTruthy();
  });

  it('shows a Retry error state instead of "No notes yet" when the fetch fails', async () => {
    mockNotesState.isError = true;
    mockNotesState.error = new Error('network down');
    await render(<TripNoteSection tripId={1} armed canEdit />);
    expect(screen.getByText('Failed to load notes')).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
    expect(screen.queryByText('No notes yet')).toBeNull();
  });

  it('pressing Retry on the error state refetches', async () => {
    mockNotesState.isError = true;
    await render(<TripNoteSection tripId={1} armed canEdit />);
    await fireEvent.press(screen.getByText('Retry'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('hides the "New note" button when the user cannot edit', async () => {
    mockNotesState.data = [];
    await render(<TripNoteSection tripId={1} armed canEdit={false} />);
    expect(screen.queryByTestId('note-new-button')).toBeNull();
  });

  it('renders a card per note with its date label', async () => {
    mockNotesState.data = [note()];
    await render(<TripNoteSection tripId={1} armed canEdit />);
    expect(screen.getByTestId('note-card-0')).toBeTruthy();
    expect(screen.getByText('Pack sunscreen')).toBeTruthy();
    expect(screen.getByText('15/05')).toBeTruthy();
  });

  it('shows the "Remove" swipe action label without deleting (partial reveal only)', async () => {
    mockNotesState.data = [note()];
    await render(<TripNoteSection tripId={1} armed canEdit />);
    expect(screen.getByText('Remove')).toBeTruthy();
    // Merely rendering the row (equivalent to a partial swipe reveal, since
    // `renderRightActions` is mounted regardless of drag state) must not delete anything.
    expect(mockDeleteMutate).not.toHaveBeenCalled();
  });

  it('pressing the "Remove" action deletes the note by id', async () => {
    mockNotesState.data = [note({ id: 7 })];
    await render(<TripNoteSection tripId={1} armed canEdit />);

    await fireEvent.press(screen.getByTestId('note-remove-0'));

    expect(mockDeleteMutate).toHaveBeenCalledTimes(1);
    expect(mockDeleteMutate).toHaveBeenCalledWith(7);
  });

  it('tapping the checkbox toggles isDone only and does not open the edit sheet', async () => {
    mockNotesState.data = [note({ isDone: false })];
    await render(<TripNoteSection tripId={1} armed canEdit />);

    await fireEvent.press(screen.getByTestId('note-checkbox-0'));

    expect(mockUpdateMutate).toHaveBeenCalledWith({ id: 1, body: { isDone: true } });
    // The sheet's title field stays empty — editing was not opened.
    expect(screen.getByTestId('note-title').props.value).toBe('');
  });

  it('tapping the card presents the edit sheet prefilled with the note', async () => {
    mockNotesState.data = [note({ title: 'Dresscode', body: 'Wear brown' })];
    await render(<TripNoteSection tripId={1} armed canEdit />);

    await fireEvent.press(screen.getByTestId('note-card-0'));

    expect(screen.getByTestId('note-title').props.value).toBe('Dresscode');
    expect(screen.getByTestId('note-body').props.value).toBe('Wear brown');
    expect(screen.getByText('Edit note')).toBeTruthy();
  });

  it('tapping "New note" presents an empty create sheet', async () => {
    mockNotesState.data = [note()];
    await render(<TripNoteSection tripId={1} armed canEdit />);

    await fireEvent.press(screen.getByTestId('note-new-button'));

    // The Button label and the sheet heading both read "New note" while composing.
    expect(screen.getAllByText('New note').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId('note-title').props.value).toBe('');
  });

  it('disables the checkbox and card-tap-to-edit when the user cannot edit', async () => {
    mockNotesState.data = [note()];
    await render(<TripNoteSection tripId={1} armed canEdit={false} />);

    await fireEvent.press(screen.getByTestId('note-checkbox-0'));
    expect(mockUpdateMutate).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('note-card-0'));
    // The sheet's title field stays empty — tapping the card did not open the edit sheet.
    expect(screen.getByTestId('note-title').props.value).toBe('');
  });

  it('renders no swipe-to-remove action when the user cannot edit', async () => {
    mockNotesState.data = [note()];
    await render(<TripNoteSection tripId={1} armed canEdit={false} />);

    expect(screen.queryByTestId('note-swipeable-0')).toBeNull();
    expect(screen.queryByTestId('note-remove-0')).toBeNull();
    expect(screen.getByTestId('note-card-0')).toBeTruthy();
  });
});
