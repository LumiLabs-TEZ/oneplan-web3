/**
 * Trip-end hero — port of `Component/Trip/TripEndHeroHeader.swift`: the 140pt "Pioneer" avatar
 * (trip cover), the total spent amount (animated, soft symbol / cents), and the settlement
 * status line (hidden on the History tab). The "Pioneer" capsule carries the `crown` badge.
 */
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import type { Currency } from '@/lib/currency';
import { MoneyText } from '@/ui/components';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { PioneerAvatar } from './PioneerAvatar';

const AVATAR_SIZE = 140;

export interface TripEndHeroHeaderProps {
  coverImageUrl?: string | null;
  totalSpent: number;
  unsettledCount: number;
  currency: Currency;
  /** History tab renders the hero without the settlement line (`TripEndHistory.swift:93`). */
  showStatus?: boolean;
}

export function TripEndHeroHeader({
  coverImageUrl,
  totalSpent,
  unsettledCount,
  currency,
  showStatus = true,
}: TripEndHeroHeaderProps) {
  useAppLanguage();
  const { t } = useTranslation();

  const status =
    unsettledCount === 0
      ? t('Trip ended • All settled up!')
      : t('Trip ended • %lld people need to settle up', { count: unsettledCount });

  return (
    <View style={styles.root} testID="trip-end-hero">
      <View style={styles.pioneer}>
        <PioneerAvatar size={AVATAR_SIZE} imageUrl={coverImageUrl} />
        <View style={styles.capsule}>
          <Text style={styles.capsuleText}>{t('Pioneer')}</Text>
          <Image
            source={require('@/assets/images/illustration/crown.png')}
            style={styles.crown}
            contentFit="contain"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        </View>
      </View>

      <Text style={styles.label}>{t('Total spent')}</Text>
      <MoneyText
        amount={totalSpent}
        currency={currency}
        style={styles.amountStrong}
        symbolStyle={styles.amountSymbol}
        decimalColor={colors.contentL}
      />
      {showStatus ? (
        <Text style={styles.status} testID="trip-end-hero-status">
          {status}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm },
  pioneer: { alignItems: 'center', marginBottom: spacing.xs },
  capsule: {
    marginTop: -12,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    transform: [{ rotate: '-8deg' }],
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  capsuleText: { ...beVietnamPro(14), color: colors.contentB },
  // iOS: 26pt crown at the capsule's bottom-trailing corner, offset (12, -16), rotated 12°. The
  // asset's own 26° tilt lives in the SVG wrapper on iOS, so it's folded into the rotation here;
  // the PNG is drawn 2pt larger (centred on the same spot) since the SVG crops its padding.
  crown: {
    position: 'absolute',
    right: -13,
    bottom: 15,
    width: 28,
    height: 28,
    transform: [{ rotate: '38deg' }],
  },
  label: { ...beVietnamPro(14), color: colors.contentB, textAlign: 'center' },
  // The symbol keeps the old row's 3pt gap; the cents are drawn inside the number itself.
  amountSymbol: { color: colors.contentL, marginRight: 3 },
  amountStrong: { ...beVietnamPro(36), color: colors.contentB },
  status: { ...beVietnamPro(14), color: colors.neutral700, textAlign: 'center' },
});
