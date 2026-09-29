/**
 * Port of `Component/Card/HomeCard.swift` (used by `TripDetailView`): a header strip (cover
 * avatar + editable title, `HomeCard.swift:133-165, 441-449`) above the balance + usage pill,
 * then the financial action row (New expense / Add budget), hidden when the viewer cannot
 * edit (ENDED trip or offline).
 *
 * Visuals kept from Swift: 290pt tall, radius 32, `cardBackground` sky raster, dashed white
 * inner stroke, `CurrencyDisplayField` sizes (label 14 / amount 36 / symbol 36, symbol +
 * decimals dimmed to 30%), and the `~converted` local-currency line under the balance
 * (`HomeCard.swift:380-439`). The blurred blue outer ring is intentionally omitted.
 */
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
import {
  Pressable,
  StyleSheet,
  type StyleProp,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';

import type { components } from '@/api/schema';
import { useAppLanguage } from '@/i18n';
import { useExchangeRate } from '@/features/exchange/useExchangeRate';
import {
  currencyFromCode,
  fallbackCurrency,
  moneyNumericValue,
  type Currency as CatalogCurrency,
} from '@/lib/currency';
import { images } from '@/ui/assets';
import { CachedImage, NumericText, Spinner } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { tripMoney } from '../helpers/tripMoney';

type BudgetDto = components['schemas']['BudgetDto'];
type ExpenseSummaryDto = components['schemas']['ExpenseSummaryDto'];
type Currency = components['schemas']['Currency'];

export interface HomeCardProps {
  budgets: BudgetDto[];
  expenses: ExpenseSummaryDto[];
  currency: Currency;
  /**
   * Trip's first local currency (`service.primaryLocalCurrency`). When it differs from
   * `currency`, the card shows the balance converted into it (`~154,320,610 ₩`).
   */
  localCurrency?: string | null;
  /** Shows the financial action row. `false` for ENDED trips and offline. */
  canEdit: boolean;
  coverImageUrl?: string | null;
  tripName: string;
  /** Fires with the trimmed, non-empty title on submit/blur. */
  onRename?: (name: string) => void;
  onPickCover?: () => void;
  coverUploading?: boolean;
  onNewExpense: () => void;
  onAddBudget?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const HOME_CARD_HEIGHT = 290;
const CARD_RADIUS = 32;

export function HomeCard({
  budgets,
  expenses,
  currency,
  localCurrency,
  canEdit,
  coverImageUrl,
  tripName,
  onRename,
  onPickCover,
  coverUploading = false,
  onNewExpense,
  onAddBudget,
  style,
}: HomeCardProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const cur = fallbackCurrency(currency);

  const money = tripMoney(budgets, expenses);

  const handleNewExpense = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onNewExpense();
  };

  const actions = canEdit ? (
    <View style={styles.actions}>
      <ActionButton
        label={t('Add budget')}
        variant="light"
        onPress={onAddBudget}
        testID="home-card-add-budget"
      />
      <ActionButton
        label={t('New expense')}
        variant="primary"
        onPress={handleNewExpense}
        testID="home-card-new-expense"
      />
    </View>
  ) : null;

  return (
    <View style={[styles.card, style]}>
      <View style={styles.face}>
        <Image
          source={images.trip.cardBackground}
          contentFit="cover"
          contentPosition="top"
          transition={0}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={styles.innerGlow} />
        <View pointerEvents="none" style={styles.dashedStroke} />
        <Header
          coverImageUrl={coverImageUrl}
          tripName={tripName}
          onRename={onRename}
          onPickCover={onPickCover}
          coverUploading={coverUploading}
        />
        {/* Balance area centred between the header and the actions (the iOS Spacer pair). */}
        <View style={styles.body} testID="home-card-balance">
          <AmountBlock label={t('Balance')} amount={money.balance} currency={cur}>
            <ConvertedBalanceLine amount={money.balance} from={cur.code} to={localCurrency} />
          </AmountBlock>
          <UsagePill percent={money.usagePercent} />
        </View>
        {actions}
      </View>
    </View>
  );
}

interface HeaderProps {
  coverImageUrl?: string | null;
  tripName: string;
  onRename?: (name: string) => void;
  onPickCover?: () => void;
  coverUploading: boolean;
}

/** Cover avatar (tap → `onPickCover`) + editable title, `HomeCard.swift:133-165, 441-449`. */
function Header({ coverImageUrl, tripName, onRename, onPickCover, coverUploading }: HeaderProps) {
  const [text, setText] = useState(tripName);
  const [editing, setEditing] = useState(false);
  const [syncedTripName, setSyncedTripName] = useState(tripName);

  // Mirrors `onChange(of: tripName)` — pick up server renames while not mid-edit. Adjusting
  // state during render (React's documented pattern) instead of an effect avoids the extra
  // commit + re-render a `useEffect` sync would cause.
  if (tripName !== syncedTripName && !editing) {
    setSyncedTripName(tripName);
    setText(tripName);
  }

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed) {
      if (trimmed !== tripName) onRename?.(trimmed);
    } else {
      setText(tripName);
    }
    setEditing(false);
  };

  return (
    <View style={styles.header}>
      <Pressable
        onPress={onPickCover}
        disabled={!onPickCover || coverUploading}
        style={styles.avatarWrap}
        accessibilityRole="button"
        accessibilityLabel="Change trip avatar"
        testID="home-card-cover-picker"
      >
        <CachedImage
          uri={coverImageUrl}
          style={styles.avatarImage}
          placeholder={
            <Image
              source={images.trip.defaultTripPlaceholder}
              style={styles.avatarImage}
              testID="home-card-cover-placeholder"
            />
          }
        />
        {coverUploading ? (
          <View style={styles.avatarOverlay} testID="home-card-cover-uploading">
            <Spinner size="small" />
          </View>
        ) : null}
      </Pressable>
      <TextInput
        value={text}
        onChangeText={setText}
        onFocus={() => setEditing(true)}
        onBlur={commit}
        onSubmitEditing={commit}
        style={styles.titleInput}
        testID="home-card-title-input"
      />
    </View>
  );
}

interface AmountBlockProps {
  label: string;
  amount: number;
  currency: CatalogCurrency;
  /** Extra line under the amount (the converted-balance line). */
  children?: ReactNode;
}

/**
 * `CurrencyDisplayField` port: label 14 / symbol 36 / whole 36 (+ decimals). The symbol and
 * the decimal part are drawn at 30% so the whole amount reads first.
 */
function AmountBlock({ label, amount, currency, children }: AmountBlockProps) {
  return (
    <View style={styles.amountBlock} accessible accessibilityRole="text">
      <Text style={styles.label}>{label}</Text>
      <View style={styles.amountRow}>
        {/* The symbol keeps its own (system) face, so it stays a sibling of the number. */}
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
      {children}
    </View>
  );
}

interface ConvertedBalanceLineProps {
  amount: number;
  from: string;
  to?: string | null;
}

/**
 * `~154,320,610 ₩` — the balance in the trip's first local currency (`convertedBalanceLine`,
 * `HomeCard.swift:380-403`). Hidden when there is no distinct local currency; the 18pt row is
 * reserved (empty) until the rate arrives so the card doesn't jump.
 */
function ConvertedBalanceLine({ amount, from, to }: ConvertedBalanceLineProps) {
  const local = to && to !== from ? currencyFromCode(to) : undefined;
  if (!local) return null;
  return <ConvertedBalanceValue amount={amount} from={from} local={local} />;
}

function ConvertedBalanceValue({
  amount,
  from,
  local,
}: {
  amount: number;
  from: string;
  local: NonNullable<ReturnType<typeof currencyFromCode>>;
}) {
  const rate = useExchangeRate(from, local.code);
  const converted = rate.data ? amount * rate.data.rate : null;
  return (
    <View style={styles.convertedRow} testID="home-card-converted-balance">
      {converted != null ? (
        <NumericText
          value={moneyNumericValue(converted, local)}
          minimumFractionDigits={local.decimalPlaces}
          maximumFractionDigits={local.decimalPlaces}
          prefix="~"
          suffix={` ${local.symbol}`}
          style={styles.converted}
        />
      ) : null}
    </View>
  );
}

/** 100×8 usage track (`HomeCard.swift:172-190`) — dark track, blue fill, `{percent}%` label. */
function UsagePill({ percent }: { percent: number }) {
  const clamped = Math.min(Math.max(percent, 0), 100);
  return (
    <View style={styles.pill}>
      <View style={styles.pillTrack}>
        <View style={[styles.pillFill, { width: `${clamped}%` }]} />
      </View>
      <NumericText value={percent} suffix="%" style={styles.pillLabel} />
    </View>
  );
}

interface ActionButtonProps {
  label: string;
  variant: 'light' | 'primary';
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
}

/**
 * `AddBudgetButton` (white, hairline border, soft shadow) / `NewExpenseButton` (blue vertical
 * gradient, white inner stroke, blue glow). Both stretch to share the row, 40pt tall, radius 31.
 */
function ActionButton({ label, variant, onPress, disabled = false, testID }: ActionButtonProps) {
  const inactive = disabled || !onPress;
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      disabled={inactive}
      onPress={onPress}
      style={[
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonLight,
        inactive && styles.buttonDisabled,
      ]}
      testID={testID}
    >
      {primary ? (
        <LinearGradient
          colors={['rgba(71, 107, 255, 0.19)', 'rgb(0, 79, 217)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[StyleSheet.absoluteFill, styles.buttonGradient]}
        />
      ) : null}
      <Text style={[styles.buttonLabel, primary && styles.buttonLabelPrimary]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** `contentB` at the 30% the symbol is dimmed to — the fraction colour of the balance. */
const DIMMED_AMOUNT = 'rgba(54, 54, 54, 0.3)';

const styles = StyleSheet.create({
  card: {
    height: HOME_CARD_HEIGHT,
    alignSelf: 'stretch',
    borderRadius: CARD_RADIUS,
    // The two iOS drop shadows (`HomeCard.swift:250-261`); the blue ring is `innerGlow`.
    boxShadow: '0px 0px 10px rgba(89, 135, 255, 0.13), 0px 2px 3px rgba(0, 77, 255, 0.2)',
  },
  face: {
    flex: 1,
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    backgroundColor: '#F7F7F7',
    padding: 4,
  },
  /**
   * iOS strokes the card edge with a 2pt `.blue` line blurred by 5, then clips to the card —
   * so only the inner half survives as a soft blue glow bleeding inward. An inset shadow draws
   * the same thing.
   */
  innerGlow: {
    ...StyleSheet.absoluteFill,
    borderRadius: CARD_RADIUS,
    boxShadow: 'inset 0px 0px 12px 2px rgba(0, 136, 255, 0.45)',
  },
  dashedStroke: {
    position: 'absolute',
    top: 2,
    left: 2,
    right: 2,
    bottom: 2,
    borderRadius: CARD_RADIUS - 2,
    borderWidth: 1.5,
    // iOS dash [2, 3] reads as fine dots.
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
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  avatarWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.neutral100,
    borderWidth: 0.5,
    borderColor: 'rgba(0, 0, 0, 0.15)',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.15)',
  },
  avatarImage: { width: 42, height: 42 },
  avatarOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleInput: { ...beVietnamPro(16), color: colors.contentB, flex: 1, padding: 0 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  amountBlock: { alignItems: 'center', gap: 4 },
  label: { ...beVietnamPro(14), color: colors.contentB, letterSpacing: -0.28, marginBottom: 4 },
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
  convertedRow: { height: 18, justifyContent: 'center' },
  converted: { ...beVietnamPro(14), color: colors.contentM, letterSpacing: -0.28 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 22,
    backgroundColor: colors.onSurface,
  },
  pillTrack: {
    width: 100,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.contentB,
    overflow: 'hidden',
  },
  pillFill: { height: 8, borderRadius: 4, backgroundColor: colors.blueBase },
  pillLabel: { ...beVietnamPro(14), color: colors.contentB },
  actions: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  button: {
    flex: 1,
    minHeight: 40,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLight: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    boxShadow: '0px 6px 12px rgba(0, 0, 0, 0.07), 0px 10px 18px rgba(204, 219, 240, 0.35)',
  },
  buttonPrimary: {
    borderWidth: 1.5,
    borderColor: colors.white,
    boxShadow: '0px 3px 3px rgba(99, 145, 255, 0.39), 0px 13px 6px rgba(148, 209, 255, 0.25)',
  },
  // Inside the 1.5pt white stroke, so the gradient's corners follow the inner radius.
  buttonGradient: { borderRadius: 30 },
  buttonDisabled: { opacity: 0.5 },
  buttonLabel: { ...beVietnamPro(14), color: colors.contentB, textAlign: 'center' },
  buttonLabelPrimary: { color: colors.white },
});
