/**
 * Port of `DepositOptionsSheet.swift` (`origin/feat/web3-version`, Figma `4234:13896`). How
 * money gets into the group wallet — only "OnePlan Wallet" works today; "Fiat" is a permanent,
 * disabled placeholder (`action: nil` in Swift — no handler exists anywhere on the branch), kept
 * visible on purpose so the sheet matches the product map.
 */
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import DepositContributeArrow from '@/assets/images/vault/depositContributeArrow.svg';
import DepositOptionFiat from '@/assets/images/vault/depositOptionFiat.svg';
import DepositOptionWallet from '@/assets/images/vault/depositOptionWallet.svg';
import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface DepositOptionsSheetProps {
  onOnchain: () => void;
}

export function DepositOptionsSheet({ onOnchain }: DepositOptionsSheetProps) {
  useAppLanguage();
  const { t } = useTranslation();

  return (
    <View style={styles.root} testID="deposit-options-sheet">
      <View style={styles.header}>
        <DepositContributeArrow width={28} height={28} />
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('Contribute')}</Text>
          <Text style={styles.subtitle}>
            {t('Choose one of the options below\nto deposit crypto')}
          </Text>
        </View>
      </View>

      <View style={styles.options}>
        <OptionRow
          icon={<DepositOptionFiat width={28} height={28} />}
          title={t('Fiat')}
          subtitle={t('Receive assets via global bank account')}
          onPress={undefined}
          badge={t('Coming soon')}
          testID="deposit-option-fiat"
        />
        <OptionRow
          icon={<DepositOptionWallet width={28} height={28} />}
          title={t('OnePlan Wallet')}
          subtitle={t('Receive assets via OnePlan Wallet')}
          onPress={onOnchain}
          testID="deposit-option-oneplan-wallet"
        />
      </View>
    </View>
  );
}

function OptionRow({
  icon,
  title,
  subtitle,
  onPress,
  badge,
  testID,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: (() => void) | undefined;
  /** Pill beside the title — for a row that is not tappable yet. */
  badge?: string;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={styles.row}
      accessibilityRole="button"
      accessibilityState={{ disabled: !onPress }}
      testID={testID}
    >
      <View style={styles.rowIcon}>{icon}</View>
      <View style={styles.rowText}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {title}
          </Text>
          {badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.rowSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {badge ? null : <Ionicons name="chevron-forward" size={12} color="rgba(54, 54, 54, 0.35)" />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16, paddingBottom: 48 },
  header: { alignItems: 'center', gap: 8, marginTop: 32 },
  headerText: { alignItems: 'center', gap: 4 },
  title: { ...beVietnamPro(20), letterSpacing: -0.8, color: colors.neutral950 },
  subtitle: {
    ...beVietnamPro(14),
    letterSpacing: -0.42,
    color: colors.contentM,
    textAlign: 'center',
  },
  options: { marginTop: 32, gap: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowTitle: { ...beVietnamPro(16), letterSpacing: -0.48, color: colors.neutral950 },
  rowSubtitle: { ...beVietnamPro(14), letterSpacing: -0.42, color: 'rgba(54, 54, 54, 0.4)' },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.neutral100,
  },
  badgeText: { ...beVietnamPro(12), letterSpacing: -0.24, color: colors.contentM },
});
