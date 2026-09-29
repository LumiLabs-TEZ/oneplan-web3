import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { formatDuration } from '../helpers/timeLabel';

export interface VoicePillProps {
  durationSeconds: number;
  playing: boolean;
  /** 0-1 playback progress. Reserved for a future animated waveform (not rendered yet). */
  progress?: number;
  /** Omit to render a disabled, non-interactive pill (no handler wired up). */
  onPress?: () => void;
  variant?: 'blue' | 'gray';
  testID?: string;
}

/**
 * Port of the voice pill in `PlanItem.swift:110-140` — play/pause icon, waveform glyph,
 * duration, on a top-to-bottom gradient. `blue` = `VoiceStyle.blue`, `gray` = `.gray`.
 */
const VARIANTS: Record<
  'blue' | 'gray',
  { gradient: readonly [string, string]; iconColor: string; textColor: string }
> = {
  blue: {
    gradient: [colors.blueAlpha10, '#004FD9'],
    iconColor: colors.blueBase,
    textColor: colors.white,
  },
  gray: {
    gradient: [colors.neutral200, colors.neutral600],
    iconColor: colors.neutral600,
    textColor: colors.surface,
  },
};

export function VoicePill({
  durationSeconds,
  playing,
  onPress,
  variant = 'blue',
  testID,
}: VoicePillProps) {
  const style = VARIANTS[variant];
  const disabled = !onPress;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      testID={testID}
      style={styles.root}
    >
      <LinearGradient colors={style.gradient} style={StyleSheet.absoluteFill} />
      <View style={styles.iconCircle}>
        <Ionicons name={playing ? 'pause' : 'play'} size={12} color={style.iconColor} />
      </View>
      <Ionicons name="pulse" size={13} color={style.textColor} style={styles.waveform} />
      <Text style={[styles.duration, { color: style.textColor }]}>
        {formatDuration(durationSeconds)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 108,
    alignSelf: 'flex-start',
    borderRadius: 26,
    paddingLeft: 3,
    paddingRight: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  iconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  waveform: { marginRight: 6 },
  duration: { ...beVietnamPro(14, 'regular') },
});
