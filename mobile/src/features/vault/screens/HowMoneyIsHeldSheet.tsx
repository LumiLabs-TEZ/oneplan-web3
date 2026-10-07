/**
 * Port of `HowMoneyIsHeldView.swift` (`origin/feat/web3-version`, Figma `4251:16215`/`4251:16338`).
 * Template content only — copy is ported verbatim (`howMoneyIsHeldCopy.ts`); layout/typography
 * will follow Figma in a later pass, per the Swift source's own doc comment.
 */
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { howMoneyIsHeldSections } from '../howMoneyIsHeldCopy';
import { vaultWalletKind } from '../wallet/walletHandle';

const INK = '#363636';
const BODY = '#545454';

/** Dismissed by dragging down — the form sheet shows its grabber instead of a close button. */
export function HowMoneyIsHeldSheet() {
  useAppLanguage();
  const { t } = useTranslation();
  // Android (MWA): the member's own wallet app holds the keys, so the Privy custody copy is wrong.
  const sections = howMoneyIsHeldSections(vaultWalletKind());

  return (
    // The ScrollView must be the screen's root. iOS form sheets don't pin their content to the
    // bottom, so a `flex: 1` wrapper can lay out at zero height and the sheet renders blank;
    // react-native-screens only corrects the frame of a scroll view it finds as the first subview.
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scrollContent}
      testID="how-money-is-held-sheet"
    >
      <Text style={styles.title}>{t('How your money is held?')}</Text>

      {sections.map((section) => (
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
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.surface },
  // Top padding clears the native grabber with room to spare.
  scrollContent: { paddingTop: 44, paddingHorizontal: 24, paddingBottom: 24 },
  title: { ...beVietnamPro(28), letterSpacing: -1.96, color: INK, marginBottom: 12 },
  section: { marginBottom: 8 },
  sectionTitle: {
    ...beVietnamPro(15, 'semibold'),
    letterSpacing: -0.6,
    color: INK,
    marginBottom: 4,
  },
  paragraph: { ...beVietnamPro(15, 'regular'), letterSpacing: -0.6, color: BODY, marginBottom: 8 },
  bullets: { marginLeft: 8, marginBottom: 8, gap: 4 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bulletDot: { ...beVietnamPro(15, 'regular'), color: BODY },
  bulletText: { ...beVietnamPro(15, 'regular'), letterSpacing: -0.6, color: BODY, flex: 1 },
});
