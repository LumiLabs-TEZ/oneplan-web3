import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppLanguage } from '@/i18n';
import { svg } from '@/ui/assets';
import { Button } from '@/ui/components/Button';
import { rasterIllustration } from '@/ui/components/RasterIllustration';
import { beVietnamPro } from '@/ui/typography';
// Figma exports that only wrapped a base64 PNG — shipped as rendered WebP (see RasterIllustration).
const WelcomeBackground = rasterIllustration(
  require('@/assets/images/market/welcomeMarketBackground.webp') as number,
  { width: 393, height: 583 },
);
const VerifiedBackground = rasterIllustration(
  require('@/assets/images/market/planBeingVerifiedBackground.webp') as number,
  { width: 393, height: 509 },
);

export default function PresentationScreen({ verification = false }: { verification?: boolean }) {
  useAppLanguage();
  const { t } = useTranslation();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const Logo = svg.illustration.appLogo;
  const Background = verification ? VerifiedBackground : WelcomeBackground;
  return (
    <View style={styles.screen}>
      <LinearGradient colors={['#33A3FF', '#75BFFF', '#FFFFFF']} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={{ position: 'absolute', bottom: -60 }}>
        <Background width={width} height={height * 0.7} />
      </View>
      <SafeAreaView style={styles.content}>
        {!verification ? (
          <Button variant="secondary" title={t('Close')} onPress={() => router.back()} />
        ) : null}
        <View style={styles.copy}>
          <View style={styles.brand}>
            <Logo width={33} height={33} />
            <Text style={styles.brandText}>One Plan</Text>
          </View>
          <Text style={styles.title}>
            {t(verification ? 'Your plan is being verified' : 'Welcome to Market')}
          </Text>
          <Text style={styles.body}>
            {t(
              verification
                ? "We will send you a notification via the email address you used to register your account when the Plan verification process is complete. Let's make it!"
                : 'From now on, you no longer need to spend hours researching travel and dining itineraries. You can buy and use the plan that best suits you for a very small fee.',
            )}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <Button
          title={t(verification ? 'Back to market' : 'Unlock with Pro')}
          onPress={() =>
            verification ? router.dismissTo('/(tabs)/market') : router.replace('/paywall')
          }
        />
      </SafeAreaView>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'white' },
  content: { flex: 1, padding: 24, paddingBottom: 36 },
  copy: { alignSelf: 'center', width: 300, paddingTop: 60, gap: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  brandText: { ...beVietnamPro(20), color: 'white' },
  title: { ...beVietnamPro(32), color: 'white', textAlign: 'center' },
  body: { ...beVietnamPro(14), color: 'white', textAlign: 'center' },
});
