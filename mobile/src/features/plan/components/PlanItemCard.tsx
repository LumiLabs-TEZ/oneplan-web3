import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SFSymbol } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import type { PlanItemDto } from '../types';
import { PlanImageStrip } from './PlanImageStrip';
import { VoicePill } from './VoicePill';

export interface PlanItemCardProps {
  item: PlanItemDto;
  markerColor: string;
  onPress: () => void;
  /** Omit to render the voice pill disabled (no toggle wired up). */
  voice?: { playing: boolean; onToggle: () => void };
  testID?: string;
  /** Defaults to `${testID}-voice`; `TripPlanSection` overrides with `voice-pill-{id}`. */
  voiceTestID?: string;
}

/**
 * Timeline card. Port of `PlanItem.swift` — marker dot + title, location line, voice pill,
 * image strip, description block. Each optional section only renders when the DTO has data.
 */
export function PlanItemCard({
  item,
  markerColor,
  onPress,
  voice,
  testID,
  voiceTestID,
}: PlanItemCardProps) {
  const hasVoice = typeof item.voiceDuration === 'number' && item.voiceDuration > 0;
  const hasImages = item.imageUrls.length > 0;
  const hasDescription = !!item.description;
  const hasLocation = !!item.location;

  return (
    <Pressable onPress={onPress} testID={testID} style={styles.root}>
      <View style={styles.headerRow}>
        <View style={styles.titleColumn}>
          <View style={styles.titleRow}>
            <View style={[styles.dot, { backgroundColor: markerColor }]} />
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
          </View>
          {hasLocation ? (
            <View style={styles.locationRow}>
              <SFSymbol
                name="mappin.and.ellipse"
                fallback="location-outline"
                size={12}
                frame={14}
                weight="600"
                color={colors.contentM}
              />
              <Text style={styles.location} numberOfLines={1}>
                {item.location}
              </Text>
            </View>
          ) : null}
        </View>

        {hasVoice ? (
          <VoicePill
            durationSeconds={item.voiceDuration ?? 0}
            playing={voice?.playing ?? false}
            onPress={voice?.onToggle}
            testID={voiceTestID ?? (testID ? `${testID}-voice` : undefined)}
          />
        ) : null}
      </View>

      {hasImages ? (
        <PlanImageStrip images={item.imageUrls} testID={testID ? `${testID}-strip` : undefined} />
      ) : null}

      {hasDescription ? (
        <View style={styles.descriptionBox}>
          <Text style={styles.description}>{item.description}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // `PlanItem.swift`: padding 12, radius 16, spacing 10, soft 0-offset shadow.
  root: {
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    gap: 10,
    boxShadow: '0px 0px 9px rgba(0, 0, 0, 0.06)',
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  titleColumn: { flex: 1, gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  title: { ...beVietnamPro(16, 'medium'), color: colors.contentB, flexShrink: 1 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  location: { ...beVietnamPro(14, 'regular'), color: colors.contentM, flexShrink: 1 },
  descriptionBox: {
    padding: 16,
    backgroundColor: colors.background,
    borderRadius: 12,
  },
  description: { ...beVietnamPro(14, 'regular'), color: colors.contentB },
});
