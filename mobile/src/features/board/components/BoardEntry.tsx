import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';
import { BoardButton, styles } from './common';
import { NumericText } from '@/ui/components';
import { rasterIllustration } from '@/ui/components/RasterIllustration';

const CreateArt = rasterIllustration(
  require('@/assets/images/board/createBoardThumbnail.png') as number,
  { width: 42, height: 42 },
);
export function SocialLogos({ small = false }: { small?: boolean }) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced || small ? 1 : 0);
  useEffect(() => {
    progress.set(withDelay(180, withSpring(1, { damping: 13, stiffness: 150 })));
  }, [progress]);
  const instagram = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${-4.5 * progress.get()}deg` },
      { scale: 0.88 + 0.12 * progress.get() },
      { translateX: (1 - progress.get()) * 12 },
      { translateY: (1 - progress.get()) * 6 },
    ],
  }));
  const tiktok = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${4.62 * progress.get()}deg` },
      { scale: 0.88 + 0.12 * progress.get() },
      { translateX: (1 - progress.get()) * -12 },
      { translateY: (1 - progress.get()) * 6 },
    ],
  }));
  return (
    <View
      style={{
        width: small ? 42 : 65,
        height: small ? 42 : 50,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <Animated.View
        style={[small ? { position: 'absolute', left: -1.5, top: -1.5 } : undefined, instagram]}
      >
        <Image
          source={require('@/assets/images/board/boardInstagramLogo.png')}
          style={{ width: small ? 29 : 42, height: small ? 29 : 42 }}
        />
      </Animated.View>
      <Animated.View
        style={[
          small ? { position: 'absolute', left: 10.5, top: 13.5 } : { marginLeft: -15 },
          tiktok,
        ]}
      >
        <Image
          source={require('@/assets/images/board/boardTikTokLogo.png')}
          style={{
            width: small ? 31 : 38,
            height: small ? 31 : 38,
            borderRadius: small ? 7.4 : 10,
          }}
        />
      </Animated.View>
    </View>
  );
}
export function ImportHero({
  available,
  checking,
  onPaste,
  onCredits,
}: {
  available?: number;
  checking: boolean;
  onPaste: () => void;
  onCredits: () => void;
}) {
  useAppLanguage();
  const { t } = useTranslation();
  return (
    <View style={styles.hero}>
      <LinearGradient colors={['#D9F0FF', '#FFFFFF']} style={s.hero}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Scan credits')}
          testID="board-credits"
          onPress={onCredits}
          style={s.credit}
        >
          <Ionicons name="sparkles" size={15} color={colors.neutral600} />
          {available == null ? (
            <Text style={s.creditText}>—</Text>
          ) : (
            <NumericText value={available} style={s.creditText} />
          )}
        </Pressable>
        <SocialLogos />
        <Text style={s.importTitle}>{t('Import via link')}</Text>
        <Text style={s.description}>
          {t(
            'Save pin throughout your favorite Tik Tok video or Instagram video. Copy URL and paste it here.',
          )}
        </Text>
      </LinearGradient>
      <BoardButton
        testID="board-paste"
        title={t('Paste link')}
        variant="dark"
        loading={checking}
        onPress={onPaste}
      />
    </View>
  );
}
export function CreateBoardRow({ onPress }: { onPress: () => void }) {
  useAppLanguage();
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('New Board')}
      testID="board-create"
      onPress={onPress}
      style={s.create}
    >
      <View style={{ width: 42, height: 42, borderRadius: 14, overflow: 'hidden' }}>
        <CreateArt width={42} height={42} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={s.createHint}>{t('Create your list with')}</Text>
        <Text style={s.createTitle}>{t('Boards')}</Text>
      </View>
      <Text style={s.pill}>{t('New Board')}</Text>
    </Pressable>
  );
}
const s = StyleSheet.create({
  hero: {
    height: 146,
    borderRadius: 25,
    paddingHorizontal: 11,
    paddingBottom: 14,
    justifyContent: 'flex-end',
    gap: 6,
    overflow: 'hidden',
  },
  credit: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF99',
  },
  creditText: { ...beVietnamPro(15), letterSpacing: -0.3, color: colors.neutral950 },
  importTitle: { ...beVietnamPro(16), letterSpacing: -0.64, color: colors.neutral950 },
  description: { ...beVietnamPro(13), letterSpacing: -0.65, color: colors.neutral600 },
  create: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    padding: 12,
    paddingRight: 20,
    backgroundColor: colors.blueBase,
    borderRadius: 20,
  },
  createHint: { ...beVietnamPro(14), color: '#FFFFFF80', letterSpacing: -0.28 },
  createTitle: { ...beVietnamPro(15), color: 'white', letterSpacing: -0.3 },
  pill: {
    ...beVietnamPro(14),
    color: colors.contentB,
    backgroundColor: 'white',
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: 'hidden',
  },
});
