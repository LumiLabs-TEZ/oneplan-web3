import { Alert, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/i18n';
import { usePinExtractionStore } from '@/sse/pinExtractionStore';
import { extractionService } from '@/sse/extractionService';
import { requireOnline } from '@/offline/guardOnline';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';
import LightStars from '@/assets/images/board/processPinLightStars.svg';
import { BoardCover } from './BoardRow';
import { BoardButton, styles } from './common';
export function ActiveScanCard() {
  useAppLanguage();
  const { t } = useTranslation();
  const session = usePinExtractionStore((s) => s.session);
  if (!session) return null;
  const running = session.status === 'RUNNING' || session.status === 'QUEUED';
  return (
    <View style={styles.hero}>
      <View
        style={{
          flexDirection: 'row',
          gap: 12,
          padding: 10,
          borderRadius: 20,
          backgroundColor: colors.black,
        }}
      >
        <BoardCover uri={session.videoMeta?.thumbnail} width={110} height={142} />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <LightStars width={18} height={18} />
            <Text style={{ ...beVietnamPro(15), color: 'white' }}>
              {running
                ? t('Scanning video...')
                : session.status === 'DONE'
                  ? t('%lld pins ready', { 0: session.pins.length, count: session.pins.length })
                  : t('Scan failed')}
            </Text>
          </View>
          <View style={{ height: 1, backgroundColor: '#FFFFFF20' }} />
          <Text
            numberOfLines={3}
            style={{ ...beVietnamPro(16, 'medium'), letterSpacing: -0.32, color: 'white' }}
          >
            {session.videoMeta?.description ?? session.videoMeta?.title ?? session.sourceUrl}
          </Text>
          <Text style={{ ...beVietnamPro(14), color: '#FFFFFF8C' }}>
            {t(session.sourceUrl.includes('instagram') ? 'From Instagram' : 'From TikTok')}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <BoardButton
          style={{ flex: 1, ...(session.status === 'DONE' ? { backgroundColor: '#FF424B' } : {}) }}
          textStyle={session.status === 'DONE' ? { color: 'white' } : undefined}
          variant="dark"
          title={t(session.status === 'DONE' ? 'Delete' : 'Cancel')}
          onPress={async () => {
            if (!requireOnline(t)) return;
            try {
              await extractionService.cancel();
            } catch {
              Alert.alert(t('Something went wrong'));
            }
          }}
        />
        <BoardButton
          style={{ flex: 1 }}
          title={t(running ? 'Scanning' : session.status === 'DONE' ? 'View pins' : 'Dismiss')}
          onPress={() =>
            router.push({ pathname: '/board/extract', params: { sessionId: session.id } })
          }
        />
      </View>
    </View>
  );
}
