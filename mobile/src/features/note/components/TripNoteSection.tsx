/**
 * Note tab content — port of `Component/Trip/TripTodoSection.swift` (contract F). `useTripNotes`
 * lazy-loads on first Note-tab selection via the `armed` gate (`enabled` option); the query itself
 * is cached by `tripId` so switching tabs back and forth does not reflash-empty or refetch.
 */
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { classifyQueryError } from '@/features/trip/api/queries';
import { useAppLanguage } from '@/i18n';
import { Button, EmptyState, Spinner } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { useDeleteNote, useUpdateNote } from '../api/mutations';
import { useTripNotes } from '../api/queries';
import type { TripNoteDto } from '../types';
import { AddNoteSheet, type AddNoteSheetRef } from './AddNoteSheet';
import { NoteCardRow } from './NoteCardRow';
import { SwipeToRemoveNote } from './SwipeToRemoveNote';
import { requireOnline } from '@/offline/guardOnline';

export interface TripNoteSectionProps {
  tripId: number;
  /** `true` once the Note tab has been selected at least once — gates the lazy fetch. */
  armed: boolean;
  canEdit: boolean;
}

export function TripNoteSection({ tripId, armed, canEdit }: TripNoteSectionProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const notes = useTripNotes(tripId, { enabled: armed });
  const updateNote = useUpdateNote(tripId);
  const deleteNote = useDeleteNote(tripId);
  const sheetRef = useRef<AddNoteSheetRef>(null);

  const list = notes.data ?? [];
  const isLoading = notes.isPending && list.length === 0;
  const isError = notes.isError && list.length === 0;
  const isEmpty = !isLoading && !isError && list.length === 0;

  const handleToggle = (note: TripNoteDto) => {
    if (!requireOnline(t)) return;
    updateNote.mutate({ id: note.id, body: { isDone: !note.isDone } });
  };

  // Loading / error / empty claim the slack of the trip detail's min-height scroll content so the
  // white container fills the visible area (`TripTodoSection.swift:44,78-81`); a list hugs its rows.
  const fill = list.length === 0;

  return (
    <View style={[styles.root, fill && styles.fill]}>
      <View style={[styles.container, fill && styles.fill]}>
        {isLoading ? (
          <Spinner fill />
        ) : isError ? (
          <EmptyState
            title={t('Failed to load notes')}
            body={notes.error ? classifyQueryError(notes.error).message : undefined}
            action={{ label: t('Retry'), onPress: () => void notes.refetch() }}
            style={styles.emptyState}
          />
        ) : isEmpty ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{t('No notes yet')}</Text>
            <Text style={styles.emptyBody}>{t('Add your first note to get started')}</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {list.map((note, index) =>
              canEdit ? (
                <SwipeToRemoveNote
                  key={note.id}
                  index={index}
                  onRemove={() => {
                    if (!requireOnline(t)) return false;
                    deleteNote.mutate(note.id);
                    return true;
                  }}
                >
                  <NoteCardRow
                    note={note}
                    onEditPress={() => sheetRef.current?.present(note)}
                    onToggle={() => handleToggle(note)}
                    testID={`note-card-${index}`}
                    checkboxTestID={`note-checkbox-${index}`}
                  />
                </SwipeToRemoveNote>
              ) : (
                // Read-only trip: no swipe-to-remove, and `NoteCardRow`'s own `canEdit` gate
                // disables the checkbox and card-tap-to-edit.
                <NoteCardRow
                  key={note.id}
                  note={note}
                  onEditPress={() => sheetRef.current?.present(note)}
                  onToggle={() => handleToggle(note)}
                  canEdit={false}
                  testID={`note-card-${index}`}
                  checkboxTestID={`note-checkbox-${index}`}
                />
              ),
            )}
          </View>
        )}
      </View>

      {canEdit ? (
        <Button
          title={t('New note')}
          onPress={() => sheetRef.current?.present()}
          testID="note-new-button"
        />
      ) : null}

      <AddNoteSheet ref={sheetRef} tripId={tripId} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  fill: { flexGrow: 1 },
  container: {
    minHeight: 140,
    paddingVertical: 8,
    backgroundColor: colors.white,
    borderRadius: 32,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: spacing.xxl,
  },
  emptyTitle: { ...beVietnamPro(16, 'medium'), color: colors.contentB, textAlign: 'center' },
  emptyBody: { ...beVietnamPro(14), color: colors.contentM, textAlign: 'center' },
  list: { paddingHorizontal: 8, gap: 8 },
});
