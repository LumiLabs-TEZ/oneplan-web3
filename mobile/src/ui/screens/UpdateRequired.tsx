/**
 * Hard version gate — port of `ios/OnePlan/OnePlan/View/UpdateRequiredView.swift`.
 * Full-screen, no dismiss affordance; the only way out is "Update now".
 */
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppLanguage } from '@/i18n';
import { openStoreForUpdate, type UpdateInfo } from '@/native/versionGate';
import { images } from '@/ui/assets';
import { Button } from '@/ui/components/Button';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export function UpdateRequired({ info }: { info: UpdateInfo }) {
  useAppLanguage();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + 24 }]} testID="update-required">
      <View style={styles.spacer} />
      <Image
        source={images.illustration.updateRequiredCharacter}
        style={styles.character}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
      <View style={styles.copy}>
        <Text style={styles.title}>{t('Update Required')}</Text>
        <Text style={styles.body}>
          {t(
            'A new version of OnePlan Travel is available. Please update to have a better experience.',
          )}
        </Text>
      </View>
      <View style={styles.spacer} />
      <Button
        variant="primary"
        title={t('Update now')}
        onPress={() => void openStoreForUpdate(info)}
        style={styles.cta}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    alignItems: 'center',
    gap: 16,
    zIndex: 1000,
  },
  spacer: { flex: 1 },
  character: { height: 240, width: '80%' },
  copy: { paddingHorizontal: 32, gap: 10, alignItems: 'center' },
  title: { ...beVietnamPro(24, 'bold'), letterSpacing: -0.72, color: colors.contentB },
  body: {
    ...beVietnamPro(15, 'regular'),
    letterSpacing: -0.45,
    color: colors.contentM,
    textAlign: 'center',
  },
  cta: { alignSelf: 'stretch', marginHorizontal: 24 },
});
