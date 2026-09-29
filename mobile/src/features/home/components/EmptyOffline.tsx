/**
 * Port of `Component/Empty/EmptyOffline.swift`: shown on Home / Trip when offline
 * with no cached ongoing trip. `wifi.slash` → Ionicons `cloud-offline-outline`.
 */
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { StyleSheet, type StyleProp, Text, View, type ViewStyle } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { Button } from '@/ui/components/Button';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface EmptyOfflineProps {
  /** Optional "Retry" action (not in iOS; useful for pull-less screens). */
  onRetry?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function EmptyOffline({ onRetry, style }: EmptyOfflineProps) {
  useAppLanguage();
  const { t } = useTranslation();

  return (
    <View style={[styles.root, style]} testID="empty-offline">
      <Ionicons name="cloud-offline-outline" size={40} color={colors.contentM} />
      <Text style={styles.body}>
        {t("You're offline\nOnly an ongoing trip can be viewed offline")}
      </Text>
      {onRetry ? (
        <Button
          variant="secondary"
          title={t('Retry')}
          onPress={onRetry}
          style={styles.retry}
          testID="empty-offline-retry"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', alignSelf: 'stretch', gap: 14 },
  body: {
    ...beVietnamPro(16),
    color: colors.contentM,
    textAlign: 'center',
    letterSpacing: -0.64,
  },
  retry: { marginTop: 6, height: 44 },
});
