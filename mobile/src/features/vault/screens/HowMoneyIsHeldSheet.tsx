/**
 * Port of `HowMoneyIsHeldView.swift` (`origin/feat/web3-version`, Figma `4251:16215`/`4251:16338`).
 * Template content only — copy is ported verbatim (`howMoneyIsHeldCopy.ts`); layout/typography
 * will follow Figma in a later pass, per the Swift source's own doc comment.
 */
import { router } from 'expo-router';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { TripWalletSheetCloseButton } from '../components/TripWalletSheetCloseButton';
import { HOW_MONEY_IS_HELD_SECTIONS } from '../howMoneyIsHeldCopy';

const INK = '#363636';
const BODY = '#545454';

export interface HowMoneyIsHeldSheetProps {
  onClose?: () => void;
}

export function HowMoneyIsHeldSheet({ onClose }: HowMoneyIsHeldSheetProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const close = onClose ?? (() => router.back());

  return (
    <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
      <View style={styles.toolbar}>
        <TripWalletSheetCloseButton onPress={close} testID="how-money-is-held-close" />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>{t('How your money is held?')}</Text>

        {HOW_MONEY_IS_HELD_SECTIONS.map((section) => (
          <View key={section.id} style={styles.section}>
            {section.titleKey ? <Text style={styles.sectionTitle}>{t(section.titleKey)}</Text> : null}
            {section.paragraphKeys.map((key) => (
              <Text key={key} style={styles.paragraph}>
                {t(key)}
              </Text>
            ))}
            {section.bulletKeys.length > 0 ? (
              <View style={styles.bullets}>
                {section.bulletKeys.map((key) => (
                  <View key={key} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>{'•'}</Text>
                    <Text style={styles.bulletText}>{t(key)}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Fragment />
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  toolbar: { paddingHorizontal: 16, paddingBottom: 10 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 24 },
  title: { ...beVietnamPro(28), letterSpacing: -1.96, color: INK, marginBottom: 12 },
  section: { marginBottom: 8 },
  sectionTitle: { ...beVietnamPro(15, 'regular'), letterSpacing: -0.6, color: BODY, marginBottom: 4 },
  paragraph: { ...beVietnamPro(15, 'regular'), letterSpacing: -0.6, color: BODY, marginBottom: 8 },
  bullets: { marginLeft: 8, marginBottom: 8, gap: 4 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bulletDot: { ...beVietnamPro(15, 'regular'), color: BODY },
  bulletText: { ...beVietnamPro(15, 'regular'), letterSpacing: -0.6, color: BODY, flex: 1 },
});
