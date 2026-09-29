/**
 * Port of `Component/Card/OngoingCard.swift` (+ `Component/Button/NewExpenseButton.swift`).
 * Data-agnostic: the screen passes the trip (summary or full) and, when it has them,
 * the trip members (`HomeView.swift:451-458` — only ACCEPTED members are shown).
 * The card and the "New expense" button are two distinct press targets; RN's
 * responder system stops the inner press from bubbling, so no `suppressCardTap`.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import {
  Image,
  Pressable,
  StyleSheet,
  type StyleProp,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

import type { components } from '@/api/schema';
import { useAppLanguage } from '@/i18n';
import { images } from '@/ui/assets';
import { AvatarStack, type AvatarStackMember } from '@/ui/components/AvatarStack';
import { CachedImage } from '@/ui/components/CachedImage';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

type TripDto = components['schemas']['TripDto'];
type TripSummaryDto = components['schemas']['TripSummaryDto'];
type TripMemberDto = components['schemas']['TripMemberDto'];
type TripLocationDto = components['schemas']['TripLocationDto'];

export interface OngoingCardProps {
  trip: TripDto | TripSummaryDto;
  /** Defaults to `trip.members` when a full `TripDto` is passed. */
  members?: readonly TripMemberDto[];
  onPress: () => void;
  onNewExpense: () => void;
  style?: StyleProp<ViewStyle>;
}

const COVER_WIDTH = 137;
const COVER_HEIGHT = 176;

/** `HomeView.formatLocation`: "City, Country" with missing parts dropped. */
export function formatTripLocation(location?: TripLocationDto | null): string | null {
  if (!location) return null;
  const parts = [location.cityName, location.countryName].filter(
    (part): part is string => typeof part === 'string' && part.length > 0,
  );
  return parts.length > 0 ? parts.join(', ') : null;
}

/** iOS shows three empty placeholder avatars when no member is known yet. */
const PLACEHOLDER_MEMBERS: readonly AvatarStackMember[] = [{ id: -1 }, { id: -2 }, { id: -3 }];

export function acceptedMembers(members: readonly TripMemberDto[]): AvatarStackMember[] {
  return members
    .filter((member) => member.inviteStatus === 'ACCEPTED')
    .map((member) => ({ id: member.id, avatarUrl: member.avatarUrl }));
}

export function OngoingCard({ trip, members, onPress, onNewExpense, style }: OngoingCardProps) {
  useAppLanguage();
  const { t } = useTranslation();

  const source = members ?? ('members' in trip ? trip.members : []);
  const accepted = acceptedMembers(source);
  const stackMembers = accepted.length > 0 ? accepted : PLACEHOLDER_MEMBERS;
  const locationLabel = formatTripLocation(trip.location);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={trip.name}
      onPress={onPress}
      style={[styles.card, style]}
      testID="ongoing-card"
    >
      <View style={styles.cover}>
        {/* Under the image so it also covers the loading state (iOS `placeholder:`). */}
        <Image
          source={images.trip.defaultTripPlaceholder}
          style={styles.coverImage}
          resizeMode="cover"
          testID="ongoing-cover-placeholder"
        />
        <CachedImage uri={trip.coverImageUrl} style={styles.coverImage} />
        {locationLabel ? (
          <View style={styles.locationPill}>
            <Text style={styles.locationText}>{locationLabel}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <AvatarStack members={stackMembers} max={3} avatarBorder={false} />
        <Text style={styles.name} numberOfLines={2}>
          {trip.name}
        </Text>
        <View style={styles.spacer} />
        <NewExpenseButton title={t('New expense')} onPress={onNewExpense} />
      </View>
    </Pressable>
  );
}

function NewExpenseButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={styles.newExpense}
      testID="ongoing-new-expense"
    >
      <LinearGradient
        colors={['rgba(71, 107, 255, 0.19)', 'rgb(0, 79, 217)']}
        style={styles.newExpenseGradient}
      >
        <Text style={styles.newExpenseText} numberOfLines={1}>
          {title}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 4,
    borderRadius: 24,
    backgroundColor: colors.surface,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  cover: {
    width: COVER_WIDTH,
    height: COVER_HEIGHT,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.neutral100,
    borderWidth: 2,
    borderColor: colors.neutral200,
    justifyContent: 'flex-end',
  },
  coverImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  locationPill: {
    alignSelf: 'flex-start',
    margin: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 57,
    backgroundColor: colors.neutral100,
    maxWidth: COVER_WIDTH - 16,
  },
  locationText: { ...beVietnamPro(14), color: colors.contentB },
  // Fills the rest of the card. marginLeft 4 + padding 10 = 14pt from the cover, mirroring the
  // 4pt card padding + 10pt on the trailing edge, so the button has an even gap on both sides.
  body: {
    flex: 1,
    marginLeft: 4,
    height: COVER_HEIGHT + 4,
    padding: 10,
    gap: 4,
    alignItems: 'flex-start',
  },
  name: { ...beVietnamPro(18), color: colors.contentB, alignSelf: 'stretch' },
  spacer: { flex: 1 },
  // Shadows live on the unclipped outer view; `overflow: hidden` would cut them off on iOS.
  // NewExpenseButton.swift's two `.shadow`s (SwiftUI radius x2 = CSS blur).
  newExpense: {
    alignSelf: 'stretch',
    borderRadius: 31,
    boxShadow: '0px 13px 11.4px rgba(148, 209, 255, 0.25), 0px 3px 6.1px rgba(99, 145, 255, 0.39)',
  },
  newExpenseGradient: {
    borderRadius: 31,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: colors.white,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  newExpenseText: { ...beVietnamPro(14), color: colors.white, textAlign: 'center' },
});
