/**
 * Android (MWA): shown when Connect wallet finds no Mobile Wallet Adapter app installed. An RN
 * `Modal`, not a gorhom sheet: it can open over a gorhom sheet, and stacking gorhom sheets needs
 * `stackBehavior="push"` or the lower one is dismissed.
 */
import { useTranslation } from 'react-i18next';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

const PHANTOM = 'https://play.google.com/store/apps/details?id=app.phantom';
const SOLFLARE = 'https://play.google.com/store/apps/details?id=com.solflare.mobile';

export function NoWalletAppSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  useAppLanguage();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.scrim}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('Close')}
      />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]} testID="no-wallet-sheet">
        <Text style={styles.title}>{t('No Solana wallet found')}</Text>
        <Text style={styles.body}>
          {t('Install Phantom or Solflare, then come back and tap Connect wallet.')}
        </Text>
        <Pressable
          style={styles.button}
          onPress={() => void Linking.openURL(PHANTOM)}
          accessibilityRole="button"
          testID="no-wallet-get-phantom"
        >
          <Text style={styles.buttonLabel}>{t('Get Phantom')}</Text>
        </Pressable>
        <Pressable
          style={styles.button}
          onPress={() => void Linking.openURL(SOLFLARE)}
          accessibilityRole="button"
          testID="no-wallet-get-solflare"
        >
          <Text style={styles.buttonLabel}>{t('Get Solflare')}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.35)' },
  sheet: {
    backgroundColor: colors.surface,
    padding: 24,
    gap: 12,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  title: { ...beVietnamPro(18, 'semibold'), color: colors.contentB },
  body: { ...beVietnamPro(14), color: colors.contentM },
  button: {
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { ...beVietnamPro(15, 'semibold'), color: colors.white },
});
