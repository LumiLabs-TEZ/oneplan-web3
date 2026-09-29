/**
 * Wraps a Pro-gated feature — port of `Component/Premium/PremiumGate.swift`. When `allowed` is
 * `false`, the children render dimmed (unless `dimsWhenBlocked` is `false`) and non-interactive
 * (`pointerEvents="none"`), with a transparent overlay `Pressable` on top that navigates to the
 * `/paywall` route instead of the iOS sheet. When `allowed` is `true`, children render untouched.
 *
 * `onBlockedPress` runs just before that navigation, for callers that own transient chrome which
 * must close first (the FAB's `QuickActionsMenu` would otherwise stay expanded behind the
 * paywall).
 */
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAppLanguage } from '@/i18n';

export interface PremiumGateProps {
  allowed: boolean;
  dimsWhenBlocked?: boolean;
  /** Ran before `/paywall` is pushed — e.g. to close the menu the gated row lives in. */
  onBlockedPress?: () => void;
  children: ReactNode;
}

export function PremiumGate({
  allowed,
  dimsWhenBlocked = true,
  onBlockedPress,
  children,
}: PremiumGateProps) {
  useAppLanguage();
  const { t } = useTranslation();

  if (allowed) return <>{children}</>;

  return (
    <View style={styles.wrap}>
      <View style={dimsWhenBlocked ? styles.dimmed : undefined} pointerEvents="none">
        {children}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Requires Pro')}
        accessibilityHint={t('Opens subscription options')}
        testID="premium-gate"
        style={StyleSheet.absoluteFill}
        onPress={() => {
          onBlockedPress?.();
          router.push('/paywall');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  dimmed: { opacity: 0.6 },
});
