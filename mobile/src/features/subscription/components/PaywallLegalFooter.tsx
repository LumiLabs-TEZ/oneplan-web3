/**
 * Legal footer — port of `PaywallLegalFooter` (SubscriptionView.swift:896-970): a promo sentence
 * plus Terms / Privacy / EULA links opened via the system browser.
 */
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

const TERMS_URL = 'https://oneplan.space/termandconditions';
const PRIVACY_URL = 'https://oneplan.space/privacy-policy';
const EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

function openUrl(url: string) {
  void Linking.openURL(url).catch(() => undefined);
}

export function PaywallLegalFooter() {
  useAppLanguage();
  const { t } = useTranslation();
  const [promoBefore, promoAfter = ''] = t('Stop planning trips across %@', { 0: '\uFFFC' }).split(
    '\uFFFC',
  );

  return (
    <View style={styles.root}>
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <View style={{ width: 70, height: 38, overflow: 'hidden' }}>
            <Image
              source={require('../../../../assets/images/subscription/oneplanPaywallPromo.png')}
              style={{ width: 86.8, height: 86.8, left: -6, top: -22.7 }}
            />
          </View>
          <Text style={[styles.promo, { flex: 1 }]}>
            {promoBefore}
            <Text style={{ color: colors.blueBase }}>{t('Screenshots, Sheets & Videos.')}</Text>
            {promoAfter}
          </Text>
        </View>
        <Text style={styles.body}>
          {t(
            'Save places from videos, build travel Boards, plan with friends, discover trip ideas, & manage group expenses in one place.',
          )}
        </Text>
      </View>
      <View style={styles.links}>
        <LegalLink testID="paywall-terms" label={t('Terms of Service')} url={TERMS_URL} />
        <LegalLink testID="paywall-privacy" label={t('Privacy Policy')} url={PRIVACY_URL} />
        <LegalLink testID="paywall-eula" label={t('Terms of Use (EULA)')} url={EULA_URL} />
      </View>
    </View>
  );
}

function LegalLink({ label, url, testID }: { label: string; url: string; testID: string }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => openUrl(url)} testID={testID}>
      <Text style={styles.linkLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  promo: { ...beVietnamPro(19, 'regular'), letterSpacing: -0.76, color: colors.neutral950 },
  body: { ...beVietnamPro(14, 'regular'), letterSpacing: -0.7, color: colors.neutral600 },
  links: { gap: spacing.sm },
  linkLabel: { ...beVietnamPro(14, 'regular'), letterSpacing: -0.7, color: colors.contentM },
});
