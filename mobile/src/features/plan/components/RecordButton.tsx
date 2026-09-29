/**
 * Message-header record pill. Port of `RecordButton`
 * (`ios/OnePlan/OnePlan/Component/Plan/VoiceRecordingComponents.swift:9-56`) — mic/checkmark
 * circle + "Record"/"Recorded" label, blue while idle, dark once a recording exists, with a
 * trailing trash button that only appears once there's something to delete.
 */
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface RecordButtonProps {
  hasRecording: boolean;
  onPress: () => void;
  /** Omit to hide the trash button even when `hasRecording` is true. */
  onDelete?: () => void;
  testID?: string;
}

export function RecordButton({
  hasRecording,
  onPress,
  onDelete,
  testID = 'plan-record',
}: RecordButtonProps) {
  useAppLanguage();
  const { t } = useTranslation();

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={[styles.pill, hasRecording ? styles.pillRecorded : styles.pillIdle]}
        testID={testID}
      >
        <View style={styles.iconCircle}>
          <Ionicons name={hasRecording ? 'checkmark' : 'mic'} size={12} color={colors.blueBase} />
        </View>
        <Text style={styles.label}>{hasRecording ? t('Recorded') : t('Record')}</Text>
      </Pressable>

      {hasRecording && onDelete ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Delete')}
          onPress={onDelete}
          style={styles.deleteButton}
          testID="plan-record-delete"
        >
          <Ionicons name="trash-outline" size={13} color={colors.warning500} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 5,
    paddingRight: 10,
    paddingVertical: 5,
    borderRadius: 999,
    gap: 8,
  },
  pillIdle: { backgroundColor: colors.blueBase },
  pillRecorded: { backgroundColor: colors.contentB },
  iconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...beVietnamPro(14), color: colors.white },
  deleteButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 89, 89, 0.09)',
  },
});
