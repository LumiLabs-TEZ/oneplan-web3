import { useTranslation } from 'react-i18next';
import { Image, type ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { images } from '@/ui/assets';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export type PassportShareKind = 'instagram' | 'message' | 'photos';

export interface PassportShareRowProps {
  onShare: (kind: PassportShareKind) => void;
  testID?: string;
}

const ACTIONS: { kind: PassportShareKind; icon: ImageSourcePropType; labelKey: string }[] = [
  { kind: 'instagram', icon: images.passport.shareInstagram, labelKey: 'IG Stories' },
  { kind: 'message', icon: images.passport.shareMessage, labelKey: 'Message' },
  { kind: 'photos', icon: images.passport.sharePhotos, labelKey: 'Photos' },
];

/** Port of `PassportCard.swift`'s private `PassportShareRow`. */
export function PassportShareRow({ onShare, testID }: PassportShareRowProps) {
  useAppLanguage();
  const { t } = useTranslation();

  return (
    <View style={styles.row} testID={testID}>
      {ACTIONS.map(({ kind, icon, labelKey }) => (
        <Pressable
          key={kind}
          accessibilityRole="button"
          onPress={() => onShare(kind)}
          style={styles.button}
          testID={testID ? `${testID}-${kind}` : undefined}
        >
          <View style={styles.circle}>
            <Image source={icon} style={styles.icon} resizeMode="contain" />
          </View>
          <Text style={styles.label} numberOfLines={1}>
            {t(labelKey)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 24 },
  button: { flex: 1, alignItems: 'center' },
  circle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { width: 32, height: 32 },
  label: { ...beVietnamPro(12, 'regular'), color: colors.contentM },
});
