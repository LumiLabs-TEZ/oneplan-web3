/**
 * Free-trial hero — port of `FreeTrialView.hero` (:112-170). The English copy reads "Planning trip
 * · with · NO limits"; Vietnamese drops the standalone connector line (`showsConnector`, :108-110)
 * so it reads "Lên kế hoạch chuyến đi · KHÔNG giới hạn".
 */
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { CachedImage, GlassSurface } from '@/ui/components';
import { useAppLanguage } from '@/i18n';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface TrialHeroProps {
  onClose: () => void;
  testID?: string;
}

export function TrialHero({ onClose, testID }: TrialHeroProps) {
  const language = useAppLanguage();
  const { t } = useTranslation();
  const showsConnector = language !== 'vi';

  return (
    <View style={styles.root} testID={testID}>
      <View style={styles.headline}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={styles.line}>
          {t('Planning trip')}
        </Text>
        {showsConnector ? (
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={styles.line}>
            {t('with')}
          </Text>
        ) : null}
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={styles.noLimits}>
          {t('NO limits')}
        </Text>

        <View style={styles.pill}>
          <Text style={styles.pillLabel}>{t('2 weeks free')}</Text>
        </View>
      </View>

      <Image
        source={require('../../../../assets/images/subscription/freeTrialScooter.png')}
        contentFit="contain"
        // The source artwork has a fixed x=211 offset; the hero clips it on narrow screens.
        style={{ position: 'absolute', left: 211, top: 86, width: 190, height: 206 }}
        pointerEvents="none"
        accessible={false}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Close')}
        onPress={onClose}
        style={styles.close}
        testID="trial-close"
      >
        <GlassSurface
          preset="control"
          radius={16}
          style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
        >
          {Platform.OS === 'ios' ? (
            <CachedImage
              uri="sf:/xmark"
              transition={0}
              contentFit="contain"
              style={{
                width: 12,
                height: 12,
                fontSize: 12,
                fontWeight: '600',
                tintColor: colors.contentB,
              }}
            />
          ) : (
            <Ionicons name="close" size={12} color={colors.contentB} />
          )}
        </GlassSurface>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    height: 288,
    overflow: 'hidden',
  },
  headline: { paddingTop: 103, paddingLeft: spacing.xxl, gap: -1, maxWidth: 274 },
  line: {
    ...beVietnamPro(36, 'semibold'),
    lineHeight: 44,
    letterSpacing: -0.72,
    color: colors.white,
  },
  noLimits: {
    fontFamily: 'BeVietnamPro-BlackItalic',
    fontStyle: 'italic',
    fontSize: 36,
    lineHeight: 44,
    letterSpacing: -0.72,
    color: colors.white,
    marginBottom: spacing.md,
  },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1.4,
    borderColor: colors.white,
    backgroundColor: colors.blueBase,
    paddingHorizontal: spacing.xxl - 1.4,
    paddingVertical: spacing.sm - 1.4,
  },
  pillLabel: {
    ...beVietnamPro(20, 'bold'),
    lineHeight: 24,
    includeFontPadding: false,
    letterSpacing: -0.6,
    color: colors.white,
  },
  close: {
    position: 'absolute',
    top: 60,
    right: spacing.xxl,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
