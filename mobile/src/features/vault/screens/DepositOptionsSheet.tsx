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
          <Text style={styles.subtitle}>{t('Choose one of the options below\nto deposit crypto')}</Text>
        </View>
      </View>

      <View style={styles.options}>
        <OptionRow
          icon={<DepositOptionFiat width={28} height={28} />}
          title={t('Fiat')}
          subtitle={t('Receive assets via global bank account')}
          onPress={undefined}
        />
        <OptionRow
          icon={<DepositOptionWallet width={28} height={28} />}
          title={t('OnePlan Wallet')}
          subtitle={t('Receive assets via OnePlan Wallet')}
          onPress={onOnchain}
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
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: (() => void) | undefined;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={styles.row}
      accessibilityRole="button"
      accessibilityState={{ disabled: !onPress }}
    >
      <View style={styles.rowIcon}>{icon}</View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={12} color="rgba(54, 54, 54, 0.35)" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 16, paddingBottom: 48 },
  header: { alignItems: 'center', gap: 8, marginTop: 32 },
  headerText: { alignItems: 'center', gap: 4 },
  title: { ...beVietnamPro(20), letterSpacing: -0.8, color: colors.neutral950 },
  subtitle: { ...beVietnamPro(14), letterSpacing: -0.42, color: colors.contentM, textAlign: 'center' },
  options: { marginTop: 32, gap: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { ...beVietnamPro(16), letterSpacing: -0.48, color: colors.neutral950 },
  rowSubtitle: { ...beVietnamPro(14), letterSpacing: -0.42, color: 'rgba(54, 54, 54, 0.4)' },
});
