/**
 * Port of `ios/OnePlan/OnePlan/View/Vault/TripVaultCard.swift` — the Group Balance card shown at
 * the top of a web3 trip, in place of the classic `HomeCard`.
 *
 * Deliberately presentational: every value is a prop and every action a callback, so it renders
 * without a network stack and the caller (a later wave's `TripVaultSection`) stays the only place
 * that knows about services.
 *
 * It is the vault counterpart to `@/features/trip/components/HomeCard` and copies its chrome on
 * purpose — same 32pt radius, same dashed rim, same `cardBackground` cover image, same
 * `CurrencyDisplayField`-shaped balance block — so a trip does not visibly change shape when it
 * gains a vault. The `cardBackground` PNG's native size (369×303) is exactly this card's
 * artboard, so it draws uncropped (`HomeCard`'s 290pt height crops the same asset).
 */
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import type { Currency as CatalogCurrency } from '@/lib/currency';
import { fallbackCurrency, formatUsdc, moneyNumericValue } from '@/lib/currency';
import { images } from '@/ui/assets';
import { CachedImage, NumericText } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { VaultPalette } from './VaultPalette';

const CARD_HEIGHT = 303;
const CARD_RADIUS = 32;

export interface TripVaultCardProps {
  tripName: string;
  coverImageUrl?: string | null;
  /** Vault balance converted to the trip's home currency. */
  balance: number;
  /** Currency code (e.g. from the trip DTO) or a resolved catalog `Currency`. */
  currency: string | CatalogCurrency;
  /** Vault balance in USDC, the figure that is actually on chain. */
  balanceUsdc: number;
  /** While end-trip consensus is PENDING, replace Deposit / Scan QR with a single CTA. */
  isWaitingForEndApproval?: boolean;
  onDeposit?: () => void;
  onScanQR?: () => void;
  onWaitingForApproval?: () => void;
  testID?: string;
}

export function TripVaultCard({
  tripName,
  coverImageUrl,
  balance,
  currency,
  balanceUsdc,
  isWaitingForEndApproval = false,
  onDeposit,
  onScanQR,
  onWaitingForApproval,
  testID = 'trip-vault-card',
}: TripVaultCardProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const cur = typeof currency === 'string' ? fallbackCurrency(currency) : currency;

  return (
    <View style={styles.card} testID={testID}>
      <Image
        source={images.trip.cardBackground}
        contentFit="cover"
        contentPosition="top"
        transition={0}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.dashedStroke} />

      <NameHeader tripName={tripName} coverImageUrl={coverImageUrl} />

      <View style={styles.body} testID="trip-vault-card-balance">
        <AmountBlock label={t('Group Balance')} amount={balance} currency={cur} />
        <Text style={styles.usdcText}>{formatUsdc(balanceUsdc)} USDC</Text>
      </View>

      <View style={styles.actions}>
        {isWaitingForEndApproval ? (
          <AccentButton
            label={t('Waiting for approval')}
            onPress={onWaitingForApproval}
            testID="trip-vault-card-waiting"
          />
        ) : (
          <>
            <DepositButton label={t('Deposit')} onPress={onDeposit} />
            <AccentButton
              label={t('Scan QR')}
              onPress={onScanQR}
              testID="trip-vault-card-scan-qr"
            />
          </>
        )}
      </View>
    </View>
  );
}

function NameHeader({
  tripName,
  coverImageUrl,
}: {
  tripName: string;
  coverImageUrl?: string | null;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.avatarWrap}>
        <CachedImage
          uri={coverImageUrl}
          style={styles.avatarImage}
          placeholder={
            <Image source={images.trip.defaultTripPlaceholder} style={styles.avatarImage} />
          }
        />
      </View>
      <Text style={styles.tripName} numberOfLines={1} ellipsizeMode="tail">
        {tripName}
      </Text>
    </View>
  );
}

interface AmountBlockProps {
  label: string;
  amount: number;
  currency: CatalogCurrency;
}

/** `CurrencyDisplayField` sizes: label 14 / symbol+amount 36, symbol dimmed to 30%. */
function AmountBlock({ label, amount, currency }: AmountBlockProps) {
  return (
    <View style={styles.amountBlock} accessible accessibilityRole="text">
      <Text style={styles.label}>{label}</Text>
      <View style={styles.amountRow}>
        <Text style={[styles.symbol, styles.dimmed]}>{currency.symbol}</Text>
        <NumericText
          value={moneyNumericValue(amount, currency)}
          minimumFractionDigits={currency.decimalPlaces}
          maximumFractionDigits={currency.decimalPlaces}
          fractionColor={DIMMED_AMOUNT}
          minimumFontScale={0.6}
          containerStyle={styles.amountFit}
          style={styles.amount}
        />
      </View>
    </View>
  );
}

/** White capsule, hairline border + double soft shadow — Swift's hand-rolled Deposit button. */
function DepositButton({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      testID="trip-vault-card-deposit"
      accessibilityRole="button"
      style={({ pressed }) => [styles.depositButton, pressed && styles.pressed]}
    >
      <Text style={styles.depositLabel}>{label}</Text>
    </Pressable>
  );
}

/**
 * The sky-blue capsule Swift draws with `glassEffectCompat(tint: VaultPalette.accent)`. RN has no
 * Liquid Glass, so this matches the library's own non-glass fallback path (a solid tinted capsule
 * with a tint-coloured shadow) — the same shape that path already renders on Android today.
 */
function AccentButton({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress?: () => void;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      style={({ pressed }) => [styles.accentButton, pressed && styles.pressed]}
    >
      <Text style={styles.accentLabel}>{label}</Text>
    </Pressable>
  );
}

/** `contentB` at the 30% the symbol is dimmed to — the fraction colour of the balance. */
const DIMMED_AMOUNT = 'rgba(54, 54, 54, 0.3)';

const styles = StyleSheet.create({
  card: {
    height: CARD_HEIGHT,
    alignSelf: 'stretch',
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    padding: 4,
    // Swift's two drop shadows.
    boxShadow:
      '0px 0px 10.35px rgba(89, 135, 255, 0.13), 0px 2px 3.05px rgba(0, 77, 255, 0.2)',
  },
  dashedStroke: {
    position: 'absolute',
    top: 1.43,
    left: 1.43,
    right: 1.43,
    bottom: 1.43,
    borderRadius: CARD_RADIUS - 1.43,
    borderWidth: 1,
    borderStyle: 'dotted',
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    // Flat approximation of `.ultraThinMaterial`, matching `HomeCard`'s own header treatment.
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  avatarWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.neutral100,
    borderWidth: 0.489,
    borderColor: 'rgba(0, 0, 0, 0.15)',
    boxShadow: '0px 1.955px 15.642px rgba(0, 0, 0, 0.15)',
  },
  avatarImage: { width: 42, height: 42 },
  tripName: { ...beVietnamPro(17), color: colors.contentB, letterSpacing: -0.68, flex: 1 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5 },
  amountBlock: { alignItems: 'center', gap: 4 },
  label: { ...beVietnamPro(14), color: colors.contentB, letterSpacing: -0.28 },
  amountRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, maxWidth: '90%' },
  symbol: { fontSize: 36, color: colors.contentB, lineHeight: 44, letterSpacing: -0.72 },
  amountFit: { flexShrink: 1, minWidth: 0 },
  amount: {
    ...beVietnamPro(36),
    color: colors.contentB,
    lineHeight: 44,
    letterSpacing: -0.72,
    flexShrink: 1,
  },
  dimmed: { opacity: 0.3 },
  usdcText: { ...beVietnamPro(14), color: colors.neutral600, letterSpacing: -0.56 },
  actions: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  pressed: { opacity: 0.85 },
  depositButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    boxShadow:
      '0px 6px 12px rgba(0, 0, 0, 0.07), 0px 10px 18px rgba(204, 219, 240, 0.35)',
  },
  depositLabel: { ...beVietnamPro(15), color: colors.contentB, letterSpacing: -0.75 },
  accentButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: VaultPalette.accent,
    // Tinted glow + tight contact shadow + top inner highlight so the primary CTA lifts off the
    // card. Kept within the actions row's 8pt + card's 4pt padding — the card clips overflow.
    boxShadow:
      '0px 4px 10px rgba(72, 184, 254, 0.5), 0px 1px 3px rgba(0, 100, 255, 0.3), inset 0px 1px 0px rgba(255, 255, 255, 0.35)',
  },
  accentLabel: { ...beVietnamPro(15), color: colors.white, letterSpacing: -0.6 },
});
