/**
 * Add/edit note sheet — port of `View/Note/AddNoteSheet.swift` (contract H). Owns the create/edit
 * mutations itself so `TripNoteSection` only needs to `present()`/`present(note)` via the ref.
 */
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import type { TextInput } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { mutationErrorMessage } from '@/api/mutationError';
import { useAppLanguage } from '@/i18n';
import { AppSheet, type AppSheetRef, Button } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { useCreateNote, useUpdateNote } from '../api/mutations';
import { canSaveNote, toCreateBody, toUpdateBody } from '../helpers/noteRules';
import type { TripNoteDto } from '../types';
import { NoteCheckbox } from './NoteCheckbox';

export interface AddNoteSheetProps {
  tripId: number;
}

export interface AddNoteSheetRef {
  /** Omit `note` to compose a new one; pass it to pre-fill for editing. */
  present: (note?: TripNoteDto) => void;
  dismiss: () => void;
}

export const AddNoteSheet = forwardRef<AddNoteSheetRef, AddNoteSheetProps>(function AddNoteSheet(
  { tripId },
  ref,
) {
  useAppLanguage();
  const { t } = useTranslation();
  const sheetRef = useRef<AppSheetRef>(null);
  const bodyInputRef = useRef<TextInput>(null);
  const createNote = useCreateNote(tripId);
  const updateNote = useUpdateNote(tripId);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isDone, setIsDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const isEditing = editingId != null;

  useImperativeHandle(ref, () => ({
    present: (note) => {
      setEditingId(note?.id ?? null);
      setTitle(note?.title ?? '');
      setBody(note?.body ?? '');
      setIsDone(note?.isDone ?? false);
      sheetRef.current?.present();
    },
    dismiss: () => sheetRef.current?.dismiss(),
  }));

  const handleSave = async () => {
    if (!canSaveNote(title) || saving) return;
    setSaving(true);
    try {
      if (editingId != null) {
        await updateNote.mutateAsync({
          id: editingId,
          body: toUpdateBody(title, body, isDone),
        });
      } else {
        await createNote.mutateAsync(toCreateBody(title, body, isDone));
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      sheetRef.current?.dismiss();
    } catch (err) {
      Alert.alert(t("Couldn't save"), mutationErrorMessage(err, t('Something went wrong')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppSheet ref={sheetRef} snapPoints={[440, '92%']} backgroundRadius={44}>
      <View style={styles.container} testID="add-note-sheet">
        <Text style={styles.title}>{isEditing ? t('Edit note') : t('New note')}</Text>

        <View style={styles.fieldsGroup}>
          <View style={styles.titleField}>
            <NoteCheckbox
              isDone={isDone}
              onToggle={() => setIsDone((d) => !d)}
              testID="add-note-checkbox"
            />
            <BottomSheetTextInput
              value={title}
              onChangeText={setTitle}
              placeholder={t('Title')}
              placeholderTextColor={colors.contentL}
              returnKeyType="next"
              onSubmitEditing={() => bodyInputRef.current?.focus()}
              style={styles.titleInput}
              testID="note-title"
            />
          </View>

          <View style={styles.bodyField}>
            <BottomSheetTextInput
              ref={bodyInputRef}
              value={body}
              onChangeText={setBody}
              placeholder={t('Note')}
              placeholderTextColor={colors.contentL}
              multiline
              textAlignVertical="top"
              style={styles.bodyInput}
              testID="note-body"
            />
          </View>
        </View>

        <Button
          title={t('Save')}
          disabled={!canSaveNote(title)}
          loading={saving}
          onPress={() => void handleSave()}
          testID="note-save"
        />
      </View>
    </AppSheet>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxxl,
    gap: 13,
  },
  title: {
    ...beVietnamPro(20),
    letterSpacing: -0.8,
    color: colors.contentB,
    textAlign: 'center',
  },
  fieldsGroup: { gap: 5 },
  titleField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 20,
    borderRadius: 20,
    backgroundColor: colors.neutral50,
  },
  titleInput: {
    flex: 1,
    ...beVietnamPro(16, 'medium'),
    letterSpacing: -0.32,
    color: colors.contentB,
    padding: 0,
  },
  bodyField: {
    minHeight: 120,
    padding: 20,
    borderRadius: 20,
    backgroundColor: colors.neutral50,
  },
  bodyInput: {
    ...beVietnamPro(15),
    letterSpacing: -0.3,
    color: colors.contentB,
    padding: 0,
    minHeight: 80,
  },
});
