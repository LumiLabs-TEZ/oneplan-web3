/**
 * Port of `VaultHistoryRow.swift`/`VaultHistoryEntry` (`origin/feat/web3-version`). One line in
 * the vault history — covers a vault expense, a deposit, and a settlement payout in the same
 * list, because a member reading it does not think of them as different kinds of thing.
 *
 * Three cosmetic flags are reused across its consumers (History tab default, trip-end review
 * ledger, leave-sheet ledger): `emphasizesSignedAmount` (red for negative amounts),
 * `usesOutlinedAllChip` (outlined "All" instead of solid blue), `placesCurrencySymbolAfter`
 * (`355,000đ` instead of `đ355,000`).
 */
import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ExpenseCategory } from '@/features/expense/categories';
import { useAppLanguage } from '@/i18n';
import { CurrencyFormatter } from '@/lib/currency';
import { images } from '@/ui/assets';
import { Avatar } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { shortenAddress } from '../shortenAddress';
import { CategoryIcon } from './CategoryIcon';

export interface VaultHistoryPerson {
  name: string;
  avatarUrl?: string | null;
}

export type VaultHistoryEntryKind =
  | { type: 'expense'; paidBy: VaultHistoryPerson | null; shareWith: VaultHistoryPerson[] }
  | { type: 'deposit'; fromAddress: string }
  | { type: 'settlement'; toName: string };

export interface VaultHistoryEntry {
  id: number;
  title: string;
  category: ExpenseCategory;
  kind: VaultHistoryEntryKind;
  /** Negative for money out, positive for money in. */
  amount: number;
  currency: 'VND' | 'USD';
  /** Dong the merchant was handed, drawn under a USDC spend (`10,000đ · 23:25`). */
  secondaryVnd?: number | null;
  time: string;
  /** Above the trip limit, no second approval yet — the money hasn't moved. */
  isAwaitingApproval?: boolean;
}

export interface VaultHistoryRowProps {
  entry: VaultHistoryEntry;
  onPress?: () => void;
  emphasizesSignedAmount?: boolean;
  usesOutlinedAllChip?: boolean;
  placesCurrencySymbolAfter?: boolean;
  testID?: string;
}

const AVATAR_SIZE = 18;
const AVATAR_OVERLAP = -7;

export function VaultHistoryRow({
  entry,
  onPress,
  emphasizesSignedAmount = false,
  usesOutlinedAllChip = false,
  placesCurrencySymbolAfter = false,
  testID,
}: VaultHistoryRowProps) {
  useAppLanguage();
  const { t } = useTranslation();

  const isAwaitingApproval = entry.isAwaitingApproval ?? false;
  const amountColor = isAwaitingApproval
    ? colors.contentL
    : emphasizesSignedAmount && entry.amount < 0
      ? colors.secondary
      : colors.contentB;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      testID={testID}
      style={({ pressed }) => [styles.row, pressed && onPress ? styles.pressed : null]}
    >
      <View style={styles.iconTile}>
        {entry.kind.type === 'expense' ? (
          <CategoryIcon category={entry.category} size={32} />
        ) : (
          <Image source={images.vault.walletHistoryDeposit} style={styles.depositIcon} resizeMode="contain" />
        )}
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title} numberOfLines={1}>
          {entry.title}
        </Text>
        <Subtitle
          entry={entry}
          usesOutlinedAllChip={usesOutlinedAllChip}
          allLabel={t('All')}
          paidBackToLabel={(name: string) => t('Paid back to %@', { 0: name })}
          peopleLabel={(count: number) => t('%lld people', { count })}
        />
      </View>

      <View style={styles.trailing}>
        <Text style={[styles.amount, { color: amountColor }]} numberOfLines={1}>
          {amountText(entry, placesCurrencySymbolAfter)}
        </Text>
        <Text style={[styles.time, { color: colors.contentM }]} numberOfLines={1}>
          {entry.secondaryVnd != null
            ? `${CurrencyFormatter.formatWhole(entry.secondaryVnd)}đ · `
            : null}
          <Text style={{ color: isAwaitingApproval ? colors.warning500 : colors.contentM }}>
            {isAwaitingApproval ? t('Needs approval') : entry.time}
          </Text>
        </Text>
      </View>
    </Pressable>
  );
}

function Subtitle({
  entry,
  usesOutlinedAllChip,
  allLabel,
  paidBackToLabel,
  peopleLabel,
}: {
  entry: VaultHistoryEntry;
  usesOutlinedAllChip: boolean;
  allLabel: string;
  paidBackToLabel: (name: string) => string;
  peopleLabel: (count: number) => string;
}) {
  if (entry.kind.type === 'deposit') {
    return (
      <Text style={styles.subtitle} numberOfLines={1}>
        {shortenAddress(entry.kind.fromAddress)}
      </Text>
    );
  }
  if (entry.kind.type === 'settlement') {
    return (
      <Text style={styles.subtitle} numberOfLines={1}>
        {paidBackToLabel(entry.kind.toName)}
      </Text>
    );
  }
  const { paidBy, shareWith } = entry.kind;
  return (
    <View style={styles.subtitleRow}>
      {paidBy ? <PayerChip person={paidBy} /> : null}
      <ShareChip
        people={shareWith}
        outlined={usesOutlinedAllChip}
        allLabel={allLabel}
        peopleLabel={peopleLabel}
      />
    </View>
  );
}

function PayerChip({ person }: { person: VaultHistoryPerson }) {
  return (
    <View style={styles.payerChip}>
      <PersonAvatar person={person} />
      <Text style={styles.chipLabelDark} numberOfLines={1}>
        {person.name}
      </Text>
    </View>
  );
}

function ShareChip({
  people,
  outlined,
  allLabel,
  peopleLabel,
}: {
  people: VaultHistoryPerson[];
  outlined: boolean;
  allLabel: string;
  peopleLabel: (count: number) => string;
}) {
  if (people.length === 0) {
    return (
      <View style={outlined ? styles.allChipOutlined : styles.allChipSolid}>
        <Text style={outlined ? styles.chipLabelDark : styles.chipLabelLight} numberOfLines={1}>
          {allLabel}
        </Text>
      </View>
    );
  }
  const shown = people.slice(0, 2);
  const remainder = people.length - shown.length;
  return (
    <View style={styles.shareChip}>
      <View style={styles.avatarStack}>
        {shown.map((person, index) => (
          <View
            key={`${person.name}-${index}`}
            style={index > 0 ? styles.avatarOverlap : undefined}
          >
            <PersonAvatar person={person} />
          </View>
        ))}
      </View>
      <Text style={styles.chipLabelLight} numberOfLines={1}>
        {remainder > 0 ? `+${remainder}` : (shown[0]?.name ?? peopleLabel(people.length))}
      </Text>
    </View>
  );
}

/** Same default silhouette as the web2 history pills (`TripHistoryList` `PillAvatar`). */
function PersonAvatar({ person }: { person: VaultHistoryPerson }) {
  return (
    <View style={styles.avatar}>
      <Avatar uri={person.avatarUrl ?? null} size={AVATAR_SIZE - 2} />
    </View>
  );
}

function amountText(entry: VaultHistoryEntry, placesCurrencySymbolAfter: boolean): string {
  const sign = entry.amount < 0 ? '-' : '+';
  const magnitude = Math.abs(entry.amount);
  if (entry.currency === 'USD') {
    return `${sign}$${CurrencyFormatter.formatUsdc(magnitude)}`;
  }
  if (placesCurrencySymbolAfter) {
    return `${sign}${CurrencyFormatter.formatWhole(magnitude)}đ`;
  }
  return `${sign}đ${CurrencyFormatter.formatWhole(magnitude)}`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 14,
  },
  pressed: { opacity: 0.7 },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.onSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  depositIcon: { width: 32, height: 32 },
  titleBlock: { flex: 1, gap: 4 },
  title: { ...beVietnamPro(15), letterSpacing: -0.3, color: colors.contentB },
  subtitle: { ...beVietnamPro(14), letterSpacing: -0.28, color: colors.contentM },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  trailing: { alignItems: 'flex-end', gap: 3 },
  amount: { ...beVietnamPro(16), letterSpacing: -0.32 },
  time: { ...beVietnamPro(14), letterSpacing: -0.28 },
  payerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingLeft: 2,
    paddingRight: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.warning500,
  },
  shareChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 2,
    paddingRight: 5,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.blueBase,
  },
  allChipSolid: {
    paddingHorizontal: 8,
    paddingTop: 2,
    paddingBottom: 3,
    borderRadius: 999,
    backgroundColor: colors.blueBase,
  },
  allChipOutlined: {
    paddingHorizontal: 8,
    paddingTop: 2,
    paddingBottom: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.neutral100,
  },
  chipLabelDark: { ...beVietnamPro(14), letterSpacing: -0.28, color: colors.contentB },
  chipLabelLight: { ...beVietnamPro(14), letterSpacing: -0.28, color: colors.white },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  avatarOverlap: { marginLeft: AVATAR_OVERLAP },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 1,
    borderColor: colors.white,
    overflow: 'hidden',
  },
});
