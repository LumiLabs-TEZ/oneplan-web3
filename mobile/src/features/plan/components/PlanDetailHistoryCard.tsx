/**
 * Plan-detail history card — Time / (map) / Location / Who join / Message
 * rows. Port of `PlanDetailView.swift` `PlanDetailHistoryCard` (:418-540) and
 * `PlanDetailLocationMapCard` (:542-584): the blue `#2A9AF8` map card only
 * renders when the plan has coordinates, and reuses `OrbitMapCard` for the
 * orbiting mini map instead of the SwiftUI `Map` + manual camera orbit.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { SFSymbol } from '@/ui/components';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import type { LatLng } from '../helpers/geo';
import { OrbitMapCard } from './OrbitMapCard';

const MAP_CARD_BLUE = '#2A9AF8';

export interface PlanDetailHistoryCardProps {
  timeAndDate: string;
  locationCoordinate: LatLng | null;
  locationName: string;
  location: string;
  whoJoin: string;
  message: string;
  /** Filled by M4.2 with the audio-playback badge. */
  audioBadge?: ReactNode;
  onDirectionPress: () => void;
  /** Location row press — enabled only when `locationCoordinate` is set. */
  onLocationPress?: () => void;
  testID?: string;
}

export function PlanDetailHistoryCard({
  timeAndDate,
  locationCoordinate,
  locationName,
  location,
  whoJoin,
  message,
  audioBadge,
  onDirectionPress,
  onLocationPress,
  testID,
}: PlanDetailHistoryCardProps) {
  useAppLanguage();
  const { t } = useTranslation();

  return (
    <View style={styles.card} testID={testID}>
      <Row title={t('Time')}>
        <Text style={styles.rowValue} numberOfLines={1}>
          {timeAndDate}
        </Text>
      </Row>

      {locationCoordinate ? (
        <View style={styles.mapCardWrap} testID="plan-detail-map-card">
          <View style={styles.mapCard}>
            <View style={styles.mapCardHeader}>
              <Text style={styles.mapCardName} numberOfLines={1}>
                {locationName}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={onDirectionPress}
                style={styles.directionPill}
                testID="plan-detail-direction"
              >
                <Text style={styles.directionLabel}>{t('Direction')}</Text>
              </Pressable>
            </View>
            <OrbitMapCard center={locationCoordinate} height={120} />
          </View>
        </View>
      ) : null}

      <Divider />

      <Pressable
        accessibilityRole="button"
        disabled={!locationCoordinate}
        onPress={onLocationPress}
        style={styles.row}
        testID="plan-detail-location"
      >
        <Text style={styles.rowTitle} numberOfLines={1}>
          {t('Location')}
        </Text>
        <View style={styles.rowTrailingInline}>
          <Text style={styles.rowValue} numberOfLines={1}>
            {location}
          </Text>
          <SFSymbol
            name="chevron.right"
            fallback="chevron-forward"
            size={12}
            weight="600"
            color={colors.contentM}
          />
        </View>
      </Pressable>

      <Divider />

      <Row title={t('Who join')}>
        <View style={styles.rowInline}>
          <SFSymbol
            name="person.3"
            fallback="people-outline"
            size={14}
            frame={22}
            color={colors.contentB}
          />
          <Text style={styles.rowValue} numberOfLines={1}>
            {whoJoin}
          </Text>
        </View>
      </Row>

      <Divider />

      <View style={styles.messageBlock}>
        <View style={styles.messageHeader}>
          <Text style={styles.messageLabel}>{t('Message')}</Text>
          {audioBadge}
        </View>
        <Text style={styles.messageValue}>{message}</Text>
      </View>
    </View>
  );
}

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.rowTrailing}>{children}</View>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.xxl, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 14,
    gap: spacing.sm,
  },
  rowTitle: { ...beVietnamPro(14), color: colors.contentM, letterSpacing: -0.7 },
  rowTrailing: { flex: 1, alignItems: 'flex-end' },
  rowTrailingInline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  rowInline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  rowValue: { ...beVietnamPro(16), color: colors.contentB },
  divider: { height: 1, backgroundColor: colors.dividerStroke },
  mapCardWrap: { paddingHorizontal: 10, paddingBottom: 4 },
  mapCard: { padding: 8, borderRadius: radius.xxl, backgroundColor: MAP_CARD_BLUE, gap: 8 },
  mapCardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mapCardName: { ...beVietnamPro(16), color: colors.white, letterSpacing: -0.32, flex: 1 },
  directionPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  directionLabel: { ...beVietnamPro(14), color: colors.white, letterSpacing: -0.28 },
  messageBlock: { paddingHorizontal: 10, paddingVertical: 14, gap: spacing.sm },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  messageLabel: { ...beVietnamPro(14), color: colors.contentM },
  messageValue: { ...beVietnamPro(16), color: colors.contentB },
});
