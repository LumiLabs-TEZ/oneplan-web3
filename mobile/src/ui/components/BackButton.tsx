/** Not in the `@/ui/components` barrel: it imports expo-router, which the barrel's tests can't load. */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';

import { GlassIconButton } from './GlassIconButton';

export interface BackButtonProps {
  /** Defaults to `router.back()`. */
  onPress?: () => void;
  label?: string;
  testID?: string;
}

/** Circular glass back chevron — the RN stand-in for the iOS 26 system back button. */
export function BackButton({ onPress, label, testID }: BackButtonProps) {
  useAppLanguage();
  const { t } = useTranslation();
  return (
    <GlassIconButton
      label={label ?? t('Back')}
      testID={testID}
      onPress={onPress ?? (() => router.back())}
    >
      <Ionicons name="chevron-back" size={20} color={colors.contentB} style={styles.icon} />
    </GlassIconButton>
  );
}

const styles = StyleSheet.create({
  // The chevron glyph's ink sits right of its box; nudge it left to look optically centered.
  icon: { marginLeft: -2 },
});
