import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAppLanguage } from '@/i18n';
import { Button } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';
import type { TrialCountdownValue } from '../helpers/trialWindow';
import { TrialHero } from './TrialHero';
import { TrialBenefits } from './TrialBenefits';
import { TrialCountdown } from './TrialCountdown';
import { TrialBackground } from './TrialBackground';
import { PaywallLegalFooter } from './PaywallLegalFooter';

/** Production layout with service boundaries injected for deterministic reference captures. */
export function FreeTrialContent({
  product,
  remaining,
  purchasing,
  start,
  close,
}: {
  product?: { displayPrice: string } | null;
  remaining: TrialCountdownValue;
  purchasing: boolean;
  start: () => unknown;
  close: () => void;
}) {
  useAppLanguage();
  const { t } = useTranslation();
  return (
    <View style={styles.root} testID="free-trial-screen">
      <StatusBar style="dark" />
      <TrialBackground />
      <ScrollView showsVerticalScrollIndicator={false}>
        <TrialHero onClose={close} testID="trial-hero" />

        <View style={styles.content}>
          <TrialBenefits testID="trial-benefits" />

          <TrialCountdown remaining={remaining} testID="trial-countdown" />

          <View style={styles.purchase}>
            <Button
              variant="dark"
              style={{ height: 52 }}
              textStyle={{ fontFamily: 'BeVietnamPro-Regular', fontSize: 17, letterSpacing: -0.68 }}
              title={t('Start 2 weeks free')}
              loading={purchasing}
              disabled={purchasing || !product}
              onPress={() => void start()}
              testID="trial-start"
            />

            {product ? (
              <Text style={styles.autoRenewNotice}>
                {t('Plan auto-renews for %@/month until canceled.', { 0: product.displayPrice })}
              </Text>
            ) : null}
          </View>
          <View style={{ paddingTop: 32 }}>
            <PaywallLegalFooter />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  content: {
    paddingHorizontal: spacing.xxl,
    paddingTop: 14,
    gap: 16,
    paddingBottom: 54,
  },
  purchase: { gap: 16 },
  autoRenewNotice: {
    ...beVietnamPro(12, 'regular'),
    letterSpacing: -0.36,
    color: colors.contentM,
    textAlign: 'center',
  },
});
