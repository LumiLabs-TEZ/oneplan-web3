import { router } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/i18n';
import { usePinExtractionStore } from '@/sse/pinExtractionStore';
import { usePinLauncher } from '@/features/board/usePinLauncher';
import { CreditSheets } from '@/features/board/components/CreditSheets';
import { SocialLogos } from '@/features/board/components/BoardEntry';
import { CachedImage } from '@/ui/components/CachedImage';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';
export function PinExtractionBanner() {
  useAppLanguage();
  const { t } = useTranslation();
  const session = usePinExtractionStore((s) => s.session);
  const launcher = usePinLauncher();
  const running = session?.status === 'RUNNING' || session?.status === 'QUEUED';
  const label = !session
    ? t('Finding more pins')
    : running
      ? t('Scanning video...')
      : session.status === 'DONE'
        ? t('%lld pins ready', { 0: session.pins.length, count: session.pins.length })
        : t(session.status === 'CANCELLED' ? 'Cancelled' : 'Scan failed');
  return (
    <>
      <Pressable
        accessibilityRole="button"
        disabled={launcher.checking}
        onPress={() =>
          session
            ? router.push({ pathname: '/board/extract', params: { sessionId: session.id } })
            : void launcher.paste()
        }
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 12,
          backgroundColor: colors.blueBase,
          borderRadius: 20,
          boxShadow: '0px 0px 18px #00000017',
        }}
      >
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            backgroundColor: 'white',
            overflow: 'hidden',
          }}
        >
          {session?.videoMeta?.thumbnail ? (
            <CachedImage uri={session.videoMeta.thumbnail} style={{ width: 42, height: 42 }} />
          ) : (
            <SocialLogos small />
          )}
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            numberOfLines={1}
            style={{ ...beVietnamPro(14), letterSpacing: -0.28, color: '#FFFFFF80' }}
          >
            {label}
          </Text>
          <Text
            numberOfLines={1}
            style={{ ...beVietnamPro(15), letterSpacing: -0.3, color: 'white' }}
          >
            {session?.videoMeta?.description?.trim() ||
              session?.videoMeta?.title?.trim() ||
              session?.sourceUrl ||
              t('TikTok & IG videos')}
          </Text>
        </View>
        <View
          style={{
            minWidth: 87,
            minHeight: 30,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 30,
            backgroundColor: 'white',
            alignItems: 'center',
            marginRight: 8,
          }}
        >
          {launcher.checking ? (
            <ActivityIndicator />
          ) : (
            <Text style={{ ...beVietnamPro(14), letterSpacing: -0.28, color: colors.contentB }}>
              {t(
                !session
                  ? 'Paste link'
                  : running
                    ? 'Scanning'
                    : session.status === 'DONE'
                      ? 'View pins'
                      : 'Dismiss',
              )}
            </Text>
          )}
        </View>
      </Pressable>
      {launcher.gate ? (
        <CreditSheets creditError={launcher.gate} onClose={launcher.closeGate} />
      ) : null}
    </>
  );
}
