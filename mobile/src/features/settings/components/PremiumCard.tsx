/**
 * "One Plan Pro" gradient card at the top of Settings — port of `SettingView.premiumCard`
 * (SettingView.swift:280).
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { OnePlanProLogoBadge } from '@/ui/components';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface PremiumCardProps {
  isPro: boolean;
  onPress: () => void;
}

export function PremiumCard({ isPro, onPress }: PremiumCardProps) {
  useAppLanguage();
  const { t } = useTranslation();
  return (
    <LinearGradient
      colors={['#3364FF', '#1E3999']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.card}
      testID="settings-premium-card"
    >
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <OnePlanProLogoBadge />
          <Text style={styles.title}>{t('One Plan')}</Text>
          <View style={styles.proBadge}>
            <Text style={styles.proLabel}>{t('Pro')}</Text>
          </View>
        </View>
        <Text style={styles.subtitle} numberOfLines={2}>
          {t('Planning your trips with friends in a funniest & easiest ways !!!')}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        testID="settings-premium-cta"
        style={({ pressed }) => [styles.ctaShadow, pressed && styles.pressed]}
      >
        <LinearGradient colors={['rgba(71,108,255,0.19)', 'rgb(0,80,217)']} style={styles.cta}>
          <Text style={styles.ctaLabel}>{isPro ? t('View Plan') : t('Upgrade now')}</Text>
        </LinearGradient>
      </Pressable>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 110,
    padding: spacing.xl,
    borderRadius: radius.xxl,
  },
  copy: { flex: 1, gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { ...beVietnamPro(25, 'semibold'), color: colors.white, letterSpacing: -1.2 },
  proBadge: {
    backgroundColor: colors.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.blueBase,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  proLabel: { ...beVietnamPro(14), color: colors.blueBase, letterSpacing: -0.52 },
  subtitle: {
    ...beVietnamPro(14),
    lineHeight: 20,
    color: 'rgba(255, 255, 255, 0.76)',
    letterSpacing: -0.65,
  },
  ctaShadow: {
    borderRadius: 31,
    boxShadow: '0px 3px 6px rgba(100,146,255,0.39), 0px 13px 22.8px rgba(149,209,255,0.25)',
  },
  cta: {
    width: 119,
    height: 41,
    borderRadius: 31,
    borderWidth: 1.5,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: { ...beVietnamPro(15), color: colors.white, letterSpacing: -0.7 },
  pressed: { opacity: 0.85 },
});
