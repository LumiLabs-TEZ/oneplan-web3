import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EXPENSE_CATEGORIES } from '@/features/expense/categories';
import {
  AmountKeypad,
  CategoryIcon,
  TripVaultCard,
  useAmountDigits,
  VaultHeaderChip,
  VaultPalette,
} from '@/features/vault/components';
import { useAppLanguage, setAppLanguage } from '@/i18n';
import { Button } from '@/ui/components/Button';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

/**
 * Visual gallery for every component in `@/features/vault/components` — renders each one in its
 * states (EN/VI via the language toggle below) for manual/screenshot verification against the
 * Swift originals (`ios/OnePlan/OnePlan/Component/Vault/*.swift`, `feat/web3-version`).
 * Dev-only, same `!isProd` guard as `(dev)/offline`. Open with `dev.lumilabs.oneplan:///vault-kit`.
 */
export default function DevVaultKitScreen() {
  const language = useAppLanguage();
  const vndKeypad = useAmountDigits(false, '200000');
  const usdcKeypad = useAmountDigits(true, '12.5');

  return (
    <SafeAreaView style={styles.screen} testID="dev-vault-kit-screen">
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Vault UI kit</Text>
        <View style={styles.langRow}>
          <Button
            title="EN"
            variant={language === 'en' ? 'primary' : 'secondary'}
            testID="dev-vault-kit-lang-en"
            onPress={() => setAppLanguage('en')}
          />
          <Button
            title="VI"
            variant={language === 'vi' ? 'primary' : 'secondary'}
            testID="dev-vault-kit-lang-vi"
            onPress={() => setAppLanguage('vi')}
          />
          <Button title="Back" variant="secondary" onPress={() => router.back()} />
        </View>

        <Section title="VaultPalette">
          <View style={styles.swatchRow}>
            <Swatch label="accent" color={VaultPalette.accent} />
            <Swatch label="scanFrame" color={VaultPalette.scanFrame} />
            <Swatch label="headerChip (on page bg)" color={VaultPalette.headerChip} backdrop={colors.background} />
          </View>
        </Section>

        <Section title="VaultHeaderChip — on a page">
          <View style={styles.rowOnPage}>
            <VaultHeaderChip>
              <View style={styles.chipContentSquare} />
            </VaultHeaderChip>
            <VaultHeaderChip cornerRadius={18}>
              <Text style={styles.chipLabel}>Balance đ1,234,567</Text>
            </VaultHeaderChip>
          </View>
        </Section>

        <Section title="VaultHeaderChip — over a camera feed">
          <View style={styles.rowOnCamera}>
            <VaultHeaderChip overCamera>
              <View style={styles.chipContentSquare} />
            </VaultHeaderChip>
            <VaultHeaderChip overCamera cornerRadius={18}>
              <Text style={styles.chipLabelLight}>Balance đ1,234,567</Text>
            </VaultHeaderChip>
          </View>
        </Section>

        <Section title="AmountKeypad — VND (allowsDecimal=false, dot hidden)">
          <Text style={styles.amountPreview}>{vndKeypad.digits || '0'}</Text>
          <AmountKeypad
            allowsDecimal={false}
            onAppend={vndKeypad.append}
            onDelete={vndKeypad.delete}
          />
        </Section>

        <Section title="AmountKeypad — USDC (allowsDecimal=true, dot shown)">
          <Text style={styles.amountPreview}>{usdcKeypad.digits || '0'}</Text>
          <AmountKeypad
            allowsDecimal
            onAppend={usdcKeypad.append}
            onDelete={usdcKeypad.delete}
          />
        </Section>

        <Section title="CategoryIcon — all 14 categories">
          <View style={styles.categoryGrid}>
            {EXPENSE_CATEGORIES.map((c) => (
              <View key={c.value} style={styles.categoryCell}>
                <CategoryIcon category={c.value} />
                <Text style={styles.categoryLabel} numberOfLines={1}>
                  {c.value}
                </Text>
              </View>
            ))}
          </View>
        </Section>

        <Section title="TripVaultCard — normal">
          <TripVaultCard tripName="Dubai 2025" balance={10_000_000} currency="VND" balanceUsdc={450} />
        </Section>

        <Section title="TripVaultCard — empty vault">
          <TripVaultCard tripName="New trip" balance={0} currency="VND" balanceUsdc={0} />
        </Section>

        <Section title="TripVaultCard — long name truncates">
          <TripVaultCard
            tripName="A trip with a very long name that has to truncate on one line"
            balance={1_234_567}
            currency="VND"
            balanceUsdc={51.2}
          />
        </Section>

        <Section title="TripVaultCard — waiting for end-trip approval">
          <TripVaultCard
            tripName="Dubai 2025"
            balance={10_000_000}
            currency="VND"
            balanceUsdc={450}
            isWaitingForEndApproval
          />
        </Section>

        <Section title="TripVaultCard — USDC rounding edge case (0.999 → 1.00 USDC)">
          <TripVaultCard tripName="Rounding check" balance={999_000} currency="VND" balanceUsdc={0.999} />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Swatch({ label, color, backdrop }: { label: string; color: string; backdrop?: string }) {
  return (
    <View style={styles.swatch}>
      <View style={[styles.swatchColor, backdrop ? { backgroundColor: backdrop } : null]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: color }]} />
      </View>
      <Text style={styles.swatchLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxxl * 2 },
  title: { ...beVietnamPro(24, 'semibold'), color: colors.contentB },
  langRow: { flexDirection: 'row', gap: spacing.sm },
  section: { gap: spacing.sm },
  sectionTitle: { ...beVietnamPro(14, 'semibold'), color: colors.neutral600 },
  swatchRow: { flexDirection: 'row', gap: spacing.md },
  swatch: { alignItems: 'center', gap: spacing.xs },
  swatchColor: {
    width: 56,
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.neutral200,
    overflow: 'hidden',
  },
  swatchLabel: { ...beVietnamPro(12), color: colors.contentM },
  rowOnPage: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.background,
    borderRadius: 12,
  },
  rowOnCamera: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
  },
  chipContentSquare: { width: 32, height: 32 },
  chipLabel: {
    ...beVietnamPro(15),
    color: colors.contentB,
    paddingHorizontal: spacing.md,
    height: 34,
    textAlignVertical: 'center',
  },
  chipLabelLight: {
    ...beVietnamPro(15),
    color: colors.white,
    paddingHorizontal: spacing.md,
    height: 34,
    textAlignVertical: 'center',
  },
  amountPreview: { ...beVietnamPro(32), color: colors.contentB },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  categoryCell: { width: 72, alignItems: 'center', gap: spacing.xs },
  categoryLabel: { ...beVietnamPro(10), color: colors.contentM, textAlign: 'center' },
});
