/**
 * Port of `Component/Trip/TripHistoryList.swift`: sections are flattened into header + entry
 * rows (`flattenHistorySections`) drawn by `HistoryListRow`. The trip detail and trip-end
 * screens feed those rows straight into their own screen-level `FlashList` (the header card,
 * tabs and hero ride in `ListHeaderComponent`), so long histories are virtualized; a FlashList
 * nested inside a vertical `ScrollView` had no bounded viewport and left the first section
 * blank. `TripHistoryList` still maps every row eagerly for small consumers. Entry rows form a
 * white card (radius 24) per day with hairline dividers; the "paid by" pill is warning500, the
 * shared scope pill is blueBase ("All" text or ≤2 overlapping avatars + "+N").
 */
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  StyleSheet,
  type StyleProp,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';

import type { HistoryEntry, HistorySection } from '@/features/trip/helpers/historyEntries';
import { deviceUses24hourClock, useAppLanguage } from '@/i18n';
import { svg } from '@/ui/assets';
import { moneyNumericValue } from '@/lib/currency';
import { Avatar, MoneyText, NumericText } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface HistoryRowHandlers {
  onExpensePress: (expenseId: number) => void;
  /** Phase 2 — budget detail sheet. Rows stay inert when omitted. */
  onBudgetPress?: (budgetId: number) => void;
  /** Expense detail is not cached — block taps while offline (`TripDetailView.swift`). */
  expensePressDisabled?: boolean;
}

export interface TripHistoryListProps extends HistoryRowHandlers {
  sections: HistorySection[];
  style?: StyleProp<ViewStyle>;
}

export type HistoryRow =
  | { type: 'header'; key: string; label: string; first: boolean }
  | { type: 'entry'; key: string; entry: HistoryEntry; isFirst: boolean; isLast: boolean };

export function flattenHistorySections(sections: readonly HistorySection[]): HistoryRow[] {
  const rows: HistoryRow[] = [];
  sections.forEach((section, sectionIndex) => {
    rows.push({
      type: 'header',
      key: `h:${section.dateKey}`,
      label: section.label,
      first: sectionIndex === 0,
    });
    section.entries.forEach((entry, index) => {
      rows.push({
        type: 'entry',
        key: `${entry.kind}:${entry.id}`,
        entry,
        isFirst: index === 0,
        isLast: index === section.entries.length - 1,
      });
    });
  });
  return rows;
}

export function TripHistoryList({ sections, style, ...handlers }: TripHistoryListProps) {
  const rows = flattenHistorySections(sections);
  // One native read per list render, not per row.
  const uses24hourClock = deviceUses24hourClock();

  return (
    <View style={style}>
      {rows.map((row) => (
        <HistoryListRow key={row.key} row={row} uses24hourClock={uses24hourClock} {...handlers} />
      ))}
    </View>
  );
}

export interface HistoryListRowProps extends HistoryRowHandlers {
  row: HistoryRow;
  /** Device clock style, read once by the list (`deviceUses24hourClock`). */
  uses24hourClock: boolean | undefined;
  /** Outer box of the row — list screens pass their horizontal inset here. */
  style?: StyleProp<ViewStyle>;
}

/** One flattened row: a day header, or an entry inside that day's card. */
export function HistoryListRow({
  row,
  onExpensePress,
  onBudgetPress,
  expensePressDisabled = false,
  uses24hourClock,
  style,
}: HistoryListRowProps) {
  if (row.type === 'header') {
    return (
      <Text
        style={[styles.header, !row.first && styles.headerSpaced, style as StyleProp<TextStyle>]}
        testID="history-header"
      >
        {row.label}
      </Text>
    );
  }
  const { entry } = row;
  const onPress =
    entry.kind === 'expense'
      ? expensePressDisabled
        ? undefined
        : () => onExpensePress(entry.id)
      : onBudgetPress
        ? () => onBudgetPress(entry.id)
        : undefined;
  return (
    <HistoryRowItem
      entry={entry}
      isFirst={row.isFirst}
      isLast={row.isLast}
      onPress={onPress}
      uses24hourClock={uses24hourClock}
      style={style}
    />
  );
}

interface HistoryRowItemProps {
  entry: HistoryEntry;
  isFirst: boolean;
  isLast: boolean;
  onPress?: () => void;
  uses24hourClock: boolean | undefined;
  style?: StyleProp<ViewStyle>;
}

function HistoryRowItem({
  entry,
  isFirst,
  isLast,
  onPress,
  uses24hourClock,
  style,
}: HistoryRowItemProps) {
  const locale = useAppLanguage();
  const { t } = useTranslation();
  const Icon = svg.categories[entry.category ?? 'OTHER'];

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={[styles.rowCard, isFirst && styles.rowFirst, isLast && styles.rowLast, style]}
      testID={`history-row-${entry.kind}-${entry.id}`}
    >
      <View style={styles.row}>
        <View style={styles.iconBox}>
          <Icon width={32} height={32} />
        </View>

        <View style={styles.main}>
          <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
            {entry.name}
          </Text>
          <View style={styles.pills}>
            {entry.payer ? (
              <PaidByPill
                label={entry.payer.type === 'group' ? t('Group') : entry.payer.displayName}
                avatarUrl={entry.payer.type === 'member' ? entry.payer.avatarUrl : null}
                isGroup={entry.payer.type === 'group'}
              />
            ) : null}
            {entry.scope.type === 'all' ? (
              <SharedPill text={t('All')} />
            ) : entry.scope.avatars.length > 0 ? (
              <SharedPill avatars={entry.scope.avatars} />
            ) : null}
          </View>
        </View>

        <View style={styles.trailing}>
          <MoneyText
            amount={entry.amount}
            currency={entry.amountCurrency}
            showDecimals={entry.amountCurrency.decimalPlaces > 0}
            symbolPosition="suffix"
            sign={entry.amountSign}
            style={[
              styles.amount,
              entry.kind === 'budget' ? styles.amountBudget : styles.amountExpense,
            ]}
            animated={false}
          />
          {entry.fx ? (
            <NumericText
              value={moneyNumericValue(entry.fx.amount, entry.fx.currency)}
              minimumFractionDigits={entry.fx.currency.decimalPlaces}
              maximumFractionDigits={entry.fx.currency.decimalPlaces}
              prefix="~"
              suffix={` ${entry.fx.currency.code}`}
              style={styles.fx}
              animated={false}
            />
          ) : null}
          <Text style={styles.time}>
            {formatTime(entry.sortDate, locale, uses24hourClock ?? null)}
          </Text>
        </View>
      </View>
      {!isLast ? <View style={styles.divider} /> : null}
    </Pressable>
  );
}

/** `Intl.DateTimeFormat` is expensive to build; one per locale × clock style. */
const timeFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Local time of an ISO timestamp; empty when unparseable. iOS formats with `"HH:mm"`, which
 * `DateFormatter` rewrites to the device's 12/24-hour preference (`1:55 PM` vs `13:55`), so the
 * clock style follows the device and the wording follows the app language. Pass
 * `uses24hourClock` when formatting many rows; the default reads the device setting per call.
 */
export function formatTime(
  iso: string,
  locale?: string,
  uses24hourClock: boolean | null | undefined = deviceUses24hourClock(),
): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const hour12 = uses24hourClock == null ? undefined : !uses24hourClock;
  const cacheKey = `${locale ?? ''}|${hour12 ?? ''}`;
  let formatter = timeFormatters.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hour12 });
    timeFormatters.set(cacheKey, formatter);
  }
  return formatter.format(new Date(ms));
}

const PILL_AVATAR = 18;
const PILL_AVATAR_RING = 1;

function PaidByPill({
  label,
  avatarUrl,
  isGroup,
}: {
  label: string;
  avatarUrl: string | null;
  isGroup: boolean;
}) {
  return (
    <View
      style={[
        styles.pill,
        styles.pillPaidBy,
        isGroup ? styles.pillTextOnly : styles.pillWithAvatar,
      ]}
    >
      {!isGroup ? <PillAvatar uri={avatarUrl} /> : null}
      <Text style={styles.pillText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function SharedPill({
  text,
  avatars = [],
}: {
  text?: string;
  avatars?: { userId: number; avatarUrl: string | null }[];
}) {
  const shown = avatars.slice(0, 2);
  const remaining = Math.max(avatars.length - 2, 0);
  return (
    <View
      style={[styles.pill, styles.pillShared, text ? styles.pillTextOnly : styles.pillWithAvatar]}
    >
      {text ? (
        <Text style={styles.pillText} numberOfLines={1}>
          {text}
        </Text>
      ) : (
        <>
          <View style={styles.pillAvatars}>
            {shown.map((member, index) => (
              <PillAvatar
                key={member.userId}
                uri={member.avatarUrl}
                style={index > 0 ? styles.pillAvatarOverlap : undefined}
              />
            ))}
          </View>
          {remaining > 0 ? <Text style={styles.pillText}>+{remaining}</Text> : null}
        </>
      )}
    </View>
  );
}

// The white ring lives on this wrapper, not on `Avatar`: `Avatar`'s outer view is
// `alignSelf: 'flex-start'` (top-pinned in a row), and a border on its frame insets the
// content box so the full-size image renders offset down-right.
function PillAvatar({ uri, style }: { uri: string | null; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.pillAvatar, style]}>
      <Avatar uri={uri} size={PILL_AVATAR - PILL_AVATAR_RING * 2} />
    </View>
  );
}

const CARD_RADIUS = 24;

const styles = StyleSheet.create({
  header: { ...beVietnamPro(14), color: colors.contentM, marginBottom: 8 },
  headerSpaced: { marginTop: 16 },
  rowCard: { backgroundColor: colors.surface },
  rowFirst: { borderTopLeftRadius: CARD_RADIUS, borderTopRightRadius: CARD_RADIUS },
  rowLast: { borderBottomLeftRadius: CARD_RADIUS, borderBottomRightRadius: CARD_RADIUS },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 14,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.neutral100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: { flex: 1, gap: 4, maxWidth: 188 },
  title: { ...beVietnamPro(15), color: colors.contentB, letterSpacing: -0.3 },
  pills: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  trailing: { marginLeft: 'auto', alignItems: 'flex-end', gap: 3 },
  amount: { ...beVietnamPro(16), letterSpacing: -0.32 },
  amountExpense: { color: colors.warning500 },
  amountBudget: { color: colors.green500 },
  fx: { ...beVietnamPro(12), color: colors.contentM },
  time: { ...beVietnamPro(14), color: colors.contentM },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.neutral100 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 2,
    borderRadius: 16,
  },
  pillPaidBy: { backgroundColor: colors.warning500 },
  pillShared: { backgroundColor: colors.blueBase },
  pillTextOnly: { paddingHorizontal: 8 },
  pillWithAvatar: { paddingLeft: 2, paddingRight: 8 },
  pillText: { ...beVietnamPro(14), color: colors.white, letterSpacing: -0.28 },
  pillAvatars: { flexDirection: 'row' },
  pillAvatar: {
    width: PILL_AVATAR,
    height: PILL_AVATAR,
    borderRadius: PILL_AVATAR / 2,
    borderWidth: PILL_AVATAR_RING,
    borderColor: colors.white,
    overflow: 'hidden',
  },
  pillAvatarOverlap: { marginLeft: -7 },
});
