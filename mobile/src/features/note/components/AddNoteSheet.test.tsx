import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { createRef } from 'react';
import { Alert } from 'react-native';

import { ApiMutationError } from '@/api/mutationError';
import { initI18n } from '@/i18n';

import type { TripNoteDto } from '../types';
import { AddNoteSheet, type AddNoteSheetRef } from './AddNoteSheet';

const mockCreateMutateAsync = jest.fn();
const mockUpdateMutateAsync = jest.fn();

jest.mock('../api/mutations', () => ({
  useCreateNote: () => ({ mutateAsync: mockCreateMutateAsync }),
  useUpdateNote: () => ({ mutateAsync: mockUpdateMutateAsync }),
}));

function note(overrides: Partial<TripNoteDto> = {}): TripNoteDto {
  return {
    id: 5,
    tripId: 1,
    createdById: 1,
    title: 'Dresscode',
    body: 'Wear brown',
    isDone: true,
    createdAt: '2026-05-15T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('AddNoteSheet', () => {
  let dismissSpy: jest.SpyInstance;

  beforeAll(() => {
    initI18n();
  });

  beforeEach(() => {
    mockCreateMutateAsync.mockReset();
    mockUpdateMutateAsync.mockReset();
    dismissSpy = jest.spyOn(BottomSheetModal.prototype, 'dismiss');
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    dismissSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it('keeps Save disabled until a title is entered, and trims whitespace-only input', async () => {
    const ref = createRef<AddNoteSheetRef>();
    await render(<AddNoteSheet ref={ref} tripId={1} />);
    expect(screen.getByTestId('note-save').props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(screen.getByTestId('note-title'), '   ');
    expect(screen.getByTestId('note-save').props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(screen.getByTestId('note-title'), 'Buy tickets');
    expect(screen.getByTestId('note-save').props.accessibilityState.disabled).toBe(false);
  });

  it('creates a note with the trimmed fields on save when composing new', async () => {
    mockCreateMutateAsync.mockResolvedValue(note());
    const ref = createRef<AddNoteSheetRef>();
    await render(<AddNoteSheet ref={ref} tripId={1} />);

    await fireEvent.changeText(screen.getByTestId('note-title'), '  Buy tickets  ');
    await fireEvent.changeText(screen.getByTestId('note-body'), '  at the counter  ');
    await fireEvent.press(screen.getByTestId('note-save'));

    await waitFor(() => expect(mockCreateMutateAsync).toHaveBeenCalledTimes(1));
    expect(mockCreateMutateAsync).toHaveBeenCalledWith({
      title: 'Buy tickets',
      isDone: false,
      body: 'at the counter',
    });
    await waitFor(() => expect(dismissSpy).toHaveBeenCalled());
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Success,
    );
  });

  it('prefills and updates the note when presenting for edit', async () => {
    mockUpdateMutateAsync.mockResolvedValue(note());
    const ref = createRef<AddNoteSheetRef>();
    await render(<AddNoteSheet ref={ref} tripId={1} />);
    await act(async () => ref.current?.present(note()));

    expect(screen.getByTestId('note-title').props.value).toBe('Dresscode');
    expect(screen.getByTestId('note-body').props.value).toBe('Wear brown');
    expect(screen.getByText('Edit note')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('note-save'));

    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalledTimes(1));
    expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
      id: 5,
      body: { title: 'Dresscode', body: 'Wear brown', isDone: true },
    });
  });

  it('shows an alert and keeps the sheet open when the save fails', async () => {
    mockCreateMutateAsync.mockRejectedValue(new ApiMutationError(400, { message: 'nope' }));
    const ref = createRef<AddNoteSheetRef>();
    await render(<AddNoteSheet ref={ref} tripId={1} />);

    await fireEvent.changeText(screen.getByTestId('note-title'), 'Buy tickets');
    await fireEvent.press(screen.getByTestId('note-save'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(dismissSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('note-title').props.value).toBe('Buy tickets');
  });
});
