/**
 * Login — port of `ios/OnePlan/OnePlan/View/LoginView.swift`.
 * Looping brand video, logo + wordmark, tagline, Apple (iOS only) and Google capsule
 * buttons, ToS / Privacy links. Errors surface via `Alert` ("Sign In Error").
 */
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { signInWithApple } from '@/auth/apple';
import { useAuthStore } from '@/auth/authStore';
import { signInWithGoogle } from '@/auth/google';
import { useAppLanguage } from '@/i18n';
import { showDevSignIn } from '@/lib/env';
import { signInDevUser } from '@/auth/devSignIn';
import { svg, video } from '@/ui/assets';
import { Button, LoopingVideo } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

const TERMS_URL = 'https://oneplan.space/termandconditions';
const PRIVACY_URL = 'https://oneplan.space/privacy-policy';
const BACKGROUND = '#EDEDEB'; // Color(red: 0.93, green: 0.93, blue: 0.92)

type Provider = 'apple' | 'google' | 'dev';

export default function LoginScreen() {
  useAppLanguage();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const status = useAuthStore((s) => s.status);
  const [pending, setPending] = useState<Provider | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable, () => setAppleAvailable(false));
  }, []);

  const run = async (provider: Provider) => {
    if (pending) return;
    setPending(provider);
    try {
      if (provider === 'apple') await signInWithApple();
      else if (provider === 'google') await signInWithGoogle();
      else await signInDevUser(); // dev/local builds only: fixed email/password user
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // User-cancelled flows are not errors (iOS ignores ASAuthorizationError.canceled).
      if (!/cancel/i.test(message)) Alert.alert(t('Sign In Error'), message, [{ text: t('OK') }]);
    } finally {
      setPending(null);
    }
  };

  const videoSize = Math.min(width, 393);
  const GoogleIcon = svg.icons.google;
  const AppLogo = svg.illustration.appLogoDark;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top, paddingBottom: insets.bottom + 24 },
      ]}
      testID="login-scroll"
    >
      <View style={{ flexGrow: 1 }} />
      <LoopingVideo source={video.login} style={{ width: videoSize, height: videoSize }} />
      <View style={styles.brandRow}>
        <AppLogo width={33} height={33} />
        <Text style={styles.brand}>One Plan</Text>
      </View>

      <View style={styles.block}>
        {/* Two authored lines; shrink to fit rather than re-wrap (VI line 1 overflows at 24pt). */}
        <Text style={styles.tagline} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
          {t('Plan the trip, track expenses,\nand settle up - all in one.')}
        </Text>

        {appleAvailable ? (
          <Button
            multiline
            variant="primary"
            title={t('Continue with Apple')}
            onPress={() => run('apple')}
            loading={pending === 'apple'}
            disabled={pending !== null}
            icon={<Ionicons name="logo-apple" size={24} color="#FFFFFF" />}
            style={[styles.provider, { backgroundColor: '#000000' }]}
          />
        ) : null}
        <Button
          multiline
          variant="secondary"
          title={t('Continue with Google')}
          onPress={() => run('google')}
          loading={pending === 'google'}
          disabled={pending !== null}
          icon={<GoogleIcon width={24} height={24} />}
          style={[styles.provider, { backgroundColor: '#FFFFFF', borderWidth: 0 }]}
        />

        {showDevSignIn ? (
          <Text
            style={styles.devLink}
            onPress={() => run('dev')}
            accessibilityRole="button"
            testID="login-dev"
          >
            Dev sign-in (email)
          </Text>
        ) : null}

        {status === 'expired' ? (
          <Text style={styles.expired}>{t('Your session has expired. Please sign in again.')}</Text>
        ) : null}

        <View style={styles.legal}>
          <Text style={styles.legalText}>{t('By continuing, you accept our')}</Text>
          <View style={styles.legalRow}>
            <Text style={styles.link} onPress={() => Linking.openURL(TERMS_URL)}>
              {t('Terms of Service')}
            </Text>
            <Text style={styles.legalText}> & </Text>
            <Text style={styles.link} onPress={() => Linking.openURL(PRIVACY_URL)}>
              {t('Privacy Policy')}
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BACKGROUND },
  content: { flexGrow: 1, alignItems: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 24 },
  brand: { ...beVietnamPro(20, 'regular'), color: '#000000' },
  block: { alignItems: 'center', gap: spacing.lg, marginTop: spacing.lg, width: '100%' },
  tagline: {
    ...beVietnamPro(24, 'bold'),
    color: colors.contentB,
    textAlign: 'center',
    marginBottom: spacing.sm,
    paddingHorizontal: 24,
  },
  provider: { alignSelf: 'stretch', marginHorizontal: 40 },
  devLink: {
    ...beVietnamPro(13, 'medium'),
    color: colors.contentM,
    textDecorationLine: 'underline',
  },
  expired: { ...beVietnamPro(13, 'regular'), color: colors.secondary, textAlign: 'center' },
  legal: { alignItems: 'center', gap: 4, marginTop: spacing.sm },
  legalRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  legalText: { ...beVietnamPro(14, 'regular'), color: colors.contentM },
  link: { ...beVietnamPro(14, 'regular'), color: colors.blueBase },
});
