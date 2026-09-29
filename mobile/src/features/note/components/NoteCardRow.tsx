/**
 * Note card row — port of `Component/Note/NoteCardRow.swift` (contract G). Tapping the card
 * (anywhere but the checkbox) opens it for editing; tapping the checkbox toggles `isDone` only.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { noteDateLabel } from '../helpers/noteRules';
import type { TripNoteDto } from '../types';
import { NoteCheckbox } from './NoteCheckbox';

export interface NoteCardRowProps {
  note: TripNoteDto;
  /**
   * Named `onEditPress` (not `onPress`) deliberately: `fireEvent.press` falls back to any
   * ancestor prop that loosely matches `onPress`/`press` when the tapped `Pressable`'s own
   * `onPress` is `undefined` — a same-named prop here would leak the caller's unconditional
   * callback straight past the `canEdit` gate below in tests (and, more importantly, is the same
   * name collision `Pressable` itself walks past on-device via `Pressability`).
   */
  onEditPress: () => void;
  onToggle: () => void;
  /** Read-only trips (`!access.canEdit`) disable card-tap-to-edit and the checkbox. */
  canEdit?: boolean;
  testID?: string;
  checkboxTestID?: string;
}

export function NoteCardRow({
  note,
  onEditPress,
  onToggle,
  canEdit = true,
  testID,
  checkboxTestID,
}: NoteCardRowProps) {
  return (
    <Pressable onPress={canEdit ? onEditPress : undefined} testID={testID} style={styles.card}>
      <View style={styles.header}>
        <NoteCheckbox
          isDone={note.isDone}
          onToggle={onToggle}
          disabled={!canEdit}
          testID={checkboxTestID}
        />
        <Text
          style={[styles.title, note.isDone && styles.titleDone]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {note.title}
        </Text>
        <Text style={styles.date} numberOfLines={1}>
          {noteDateLabel(note.createdAt)}
        </Text>
      </View>
      {note.body ? <Text style={styles.body}>{note.body}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.neutral50,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 14,
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 6,
  },
  title: {
    flex: 1,
    ...beVietnamPro(16, 'medium'),
    letterSpacing: -0.32,
    color: colors.contentB,
  },
  titleDone: { textDecorationLine: 'line-through' },
  date: {
    ...beVietnamPro(14),
    color: colors.neutral700,
    letterSpacing: -0.28,
  },
  body: {
    ...beVietnamPro(15),
    lineHeight: 21.5,
    letterSpacing: -0.3,
    color: colors.neutral900,
    textAlign: 'left',
  },
});
