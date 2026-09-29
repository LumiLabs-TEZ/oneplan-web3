/**
 * Full-screen recording card shown while a voice note is being recorded. Port of `RecordingCard`
 * (`ios/OnePlan/OnePlan/Component/Plan/VoiceRecordingComponents.swift:105-142`) — plan-name title,
 * live `m:ss` (or "Say something" before the first sample), a divider, the live waveform, and a
 * gradient stop button (`StopRecordingButton`, :175-207).
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { colors, radius } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { formatDuration } from '../helpers/timeLabel';
import { WaveformBars } from './WaveformBars';

export interface RecordingCardProps {
  title: string;
  recording: boolean;
  seconds: number;
  bars: readonly number[];
  onStop: () => void;
  testID?: string;
}

const CARD_HEIGHT = 341;
/** `Constants.ContentL.opacity(0.9)` (`RecordingWaveform`). */
const CARD_BAR_COLOR = 'rgba(199, 199, 199, 0.9)';

export function RecordingCard({
  title,
  recording,
  seconds,
  bars,
  onStop,
  testID,
}: RecordingCardProps) {
  useAppLanguage();
  const { t } = useTranslation();

  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.subtitle}>
          {recording ? formatDuration(seconds) : t('Say something')}
        </Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.waveformWrap}>
        <WaveformBars
          values={bars}
          variant="card"
          color={CARD_BAR_COLOR}
          testID="plan-recording-waveform"
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Stop')}
        onPress={onStop}
        style={styles.stopButton}
        testID="plan-record-stop"
      >
        {/* The glow lives on the outer circle; only the gradient disc is clipped. */}
        <View style={styles.stopDisc}>
          <LinearGradient
            colors={['#C2E6FF', colors.blueBase]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.stopSquare} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: CARD_HEIGHT,
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 32,
    alignItems: 'center',
    overflow: 'hidden',
  },
  header: { alignItems: 'center', gap: 4, paddingTop: 24, paddingBottom: 12, width: '100%' },
  title: { ...beVietnamPro(16, 'medium'), color: colors.contentB, paddingHorizontal: 16 },
  subtitle: { ...beVietnamPro(14), color: colors.contentM },
  divider: { height: 1, width: '100%', backgroundColor: colors.dividerStroke },
  waveformWrap: { flex: 1, width: '100%', paddingHorizontal: 12, justifyContent: 'center' },
  stopButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 26,
    boxShadow: '0px 6px 12px rgba(148, 209, 255, 0.45)',
  },
  stopDisc: {
    flex: 1,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1.7,
    borderColor: colors.white,
  },
  stopSquare: { width: 20, height: 20, borderRadius: radius.sm - 4, backgroundColor: colors.white },
});
