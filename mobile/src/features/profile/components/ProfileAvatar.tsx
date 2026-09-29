/** Port of `ProfileView.swift:239` — 155pt avatar (`AvatarProPlaceholder` ring + PRO tab for Pro), `PhotosPicker` → upload, dark overlay + spinner while uploading. */
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { Avatar, ProAvatar, Spinner } from '@/ui/components';

const SIZE = 155;

export interface ProfileAvatarProps {
  uri?: string | null;
  uploading: boolean;
  isPro?: boolean;
  onPick: () => void;
  testID?: string;
}

export function ProfileAvatar({
  uri,
  uploading,
  isPro = false,
  onPick,
  testID,
}: ProfileAvatarProps) {
  useAppLanguage();
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('Profile')}
      onPress={onPick}
      disabled={uploading}
      testID={testID}
      style={styles.wrap}
    >
      {isPro ? <ProAvatar uri={uri} size={SIZE} /> : <Avatar uri={uri} size={SIZE} />}
      {uploading ? (
        <View style={styles.overlay} testID={testID ? `${testID}-uploading` : undefined}>
          <Spinner size="large" />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignSelf: 'center' },
  overlay: {
    ...StyleSheet.absoluteFill,
    borderRadius: SIZE / 2,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
