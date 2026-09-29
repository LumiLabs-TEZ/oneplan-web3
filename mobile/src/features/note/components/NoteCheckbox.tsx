/**
 * Shared 20x20 checkbox used by both `NoteCardRow` (contract G) and `AddNoteSheet` (contract H):
 * filled BlueBase + white checkmark when done, else white fill + Neutral200 1px border.
 */
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import { colors } from '@/ui/theme';

export interface NoteCheckboxProps {
  isDone: boolean;
  onToggle: () => void;
  /** Read-only trips (`!access.canEdit`) disable toggling — used by `NoteCardRow`. */
  disabled?: boolean;
  testID?: string;
}

export function NoteCheckbox({ isDone, onToggle, disabled = false, testID }: NoteCheckboxProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isDone, disabled }}
      onPress={disabled ? undefined : onToggle}
      disabled={disabled}
      hitSlop={8}
      testID={testID}
      style={[styles.box, isDone ? styles.boxDone : styles.boxOpen]}
    >
      {isDone ? <Ionicons name="checkmark" size={12} color={colors.white} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 20,
    height: 20,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxDone: { backgroundColor: colors.blueBase },
  boxOpen: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.neutral200 },
});
