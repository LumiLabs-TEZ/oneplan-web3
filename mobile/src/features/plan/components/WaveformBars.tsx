/**
 * Static/live waveform bar row shared by the recording card and the voice-message badges.
 * Port of `RecordingWaveform` (`ios/OnePlan/OnePlan/Component/Plan/VoiceRecordingComponents.swift`
 * :158-173) — 51 two-point-wide capsules, 4pt gaps, height `max(8, level * 58)`.
 *
 * Two size variants: `'card'` matches the iOS formula verbatim (used by `RecordingCard`'s
 * full-screen presentation); `'compact'` (the default) scales down to `4 + v*20` for the smaller
 * RN message-header/detail-badge slots (`VoicePill`/`PlanItemVoice`/plan-detail audio badge),
 * which have no iOS-native equivalent this small.
 */
import { StyleSheet, View } from 'react-native';

import { colors } from '@/ui/theme';

import { WAVEFORM_BARS } from '@/native/audio';

export interface WaveformBarsProps {
  /** 0-1 levels, oldest first. Missing entries (when shorter than `count`) render as flat (0). */
  values: readonly number[];
  count?: number;
  color?: string;
  /** `'compact'` (default) = `4 + v*20`; `'card'` = the iOS `max(8, v*58)` formula. */
  variant?: 'compact' | 'card';
  testID?: string;
}

const BAR_WIDTH = 2;
const BAR_GAP = 1;

const VARIANTS: Record<'compact' | 'card', { minHeight: number; scale: number; gap: number }> = {
  compact: { minHeight: 4, scale: 20, gap: BAR_GAP },
  // iOS `RecordingWaveform` spaces its bars 4pt apart (`HStack(spacing: 4)`).
  card: { minHeight: 8, scale: 58, gap: 4 },
};

function barHeight(value: number, variant: 'compact' | 'card'): number {
  const clamped = Math.max(0, Math.min(1, value));
  const { minHeight, scale } = VARIANTS[variant];
  // iOS: `max(8, level * 58)` — the RN `compact` scale additively floors instead (`4 + v*20`),
  // since an additive floor at these smaller sizes doesn't flatten the low end the way `max` does.
  return variant === 'card' ? Math.max(minHeight, clamped * scale) : minHeight + clamped * scale;
}

export function WaveformBars({
  values,
  count = WAVEFORM_BARS,
  color = colors.contentL,
  variant = 'compact',
  testID,
}: WaveformBarsProps) {
  const bars = Array.from({ length: count }, (_, i) => values[i] ?? 0);

  return (
    <View style={[styles.root, { gap: VARIANTS[variant].gap }]} testID={testID}>
      {bars.map((value, index) => (
        <View
          key={index}
          style={[styles.bar, { height: barHeight(value, variant), backgroundColor: color }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: BAR_GAP,
    flex: 1,
  },
  bar: { width: BAR_WIDTH, borderRadius: 1 },
});
