/**
 * Port of `Component/Trip/PlanningDestinationCard.swift` + `PlanningImageHolder.swift`:
 * square cover with a 3pt neutral ring, tilted ±1.2° by the grid (`TripView.swift:139-159`),
 * then a pin icon + name row. Missing/loading covers show `defaultTripPlaceholder`.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, type StyleProp, Text, View, type ViewStyle } from 'react-native';

import type { components } from '@/api/schema';
import { CachedImage } from '@/ui/components/CachedImage';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

type TripSummaryDto = components['schemas']['TripSummaryDto'];

export interface PlanningDestinationCardProps {
  trip: TripSummaryDto;
  /** Degrees; the Trip tab alternates -1.2 / 1.2 per grid index. */
  rotate?: number;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Parses the API's `YYYY-MM-DD` as a local calendar date (no timezone shift). */
function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "MMM d" or "MMM d – MMM d" in the app language; null when no start date. */
export function formatTripDateRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  locale: string,
): string | null {
  const start = startDate ? parseDateOnly(startDate) : null;
  if (!start) return null;
  const formatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
  const end = endDate ? parseDateOnly(endDate) : null;
  if (!end || end.getTime() === start.getTime()) return formatter.format(start);
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

export function PlanningDestinationCard({
  trip,
  rotate = 0,
  onPress,
  style,
}: PlanningDestinationCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={trip.name}
      onPress={onPress}
      style={[styles.card, style]}
      testID="planning-destination-card"
    >
      <View style={[styles.cover, { transform: [{ rotate: `${rotate}deg` }] }]}>
        {/* Underlay: shown when there's no cover and while/if the remote one fails to load. */}
        <Image
          source={require('@/assets/images/market/defaultTripPlaceholder.png')}
          style={styles.coverImage}
          contentFit="cover"
        />
        <CachedImage uri={trip.coverImageUrl} style={styles.coverImage} />
      </View>
      <View style={styles.nameRow}>
        <MaterialCommunityIcons
          name="map-marker-radius-outline"
          size={15}
          color={colors.contentB}
        />
        <Text style={styles.name} numberOfLines={1}>
          {trip.name}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  cover: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.white,
    borderWidth: 3,
    borderColor: colors.neutral100,
  },
  coverImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { ...beVietnamPro(14, 'medium'), color: colors.contentB, flexShrink: 1 },
});
