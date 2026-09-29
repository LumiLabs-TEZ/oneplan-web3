import { track } from '@/analytics/track';
import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/i18n';
import { requireOnline } from '@/offline/guardOnline';
import { ScreenContainer } from '@/ui/components';
import { extractionService } from '@/sse/extractionService';
import { usePinExtractionStore } from '@/sse/pinExtractionStore';
import { extractionUrl } from './helpers/sourceUrl';
import { flattenExtractionRows } from './helpers/extractionRows';
import { PinRow } from './components/PinRow';
import { SavePinsSheet } from './components/SavePinsSheet';
import { GenerateTripSheet } from './components/GenerateTripSheet';
import { CreditSheets } from './components/CreditSheets';
import { ExtractionBeam } from './components/ExtractionBeam';
import { BoardButton, BoardNavigation, styles } from './components/common';
import { BoardCover } from './components/BoardRow';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Stars from '@/assets/images/board/processPinStars.svg';
import type { Board, PinInput } from './types';
const SCANNING_MESSAGES = [
  'Catching the spots...',
  'Finding the good places...',
  'Pulling the pins...',
  'Spot hunting...',
  'Scanning the vibe...',
  'Finding the places worth saving...',
  'Turning the post into plans...',
  'Collecting the hot spots...',
  'Hunting down the recs...',
  'Saving the places from this post...',
  'Pulling the good stuff...',
  'Finding your next stop...',
  'Making this post plannable...',
  'Turning inspo into pins...',
  'From post to itinerary...',
];
export default function ExtractionScreen() {
  useAppLanguage();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ sourceUrl?: string; sessionId?: string }>();
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const session = usePinExtractionStore((s) => s.session);
  const selected = usePinExtractionStore((s) => s.selected);
  const connecting = usePinExtractionStore((s) => s.connecting);
  const error = usePinExtractionStore((s) => s.error);
  const creditError = usePinExtractionStore((s) => s.creditError);
  const [save, setSave] = useState<'board' | 'trip' | null>(null);
  const [generate, setGenerate] = useState<Board | null>(null);
  const [messageIndex, setMessageIndex] = useState(0);
  // Height of the floating bottom bar, reserved under the list so the last pin scrolls clear.
  const [barHeight, setBarHeight] = useState(0);
  const [navHeight, setNavHeight] = useState(0);
  const mountedInput = useRef('');
  const running = session?.status === 'RUNNING' || session?.status === 'QUEUED';
  useEffect(() => {
    if (!running && !connecting) return;
    const timer = setInterval(
      () => setMessageIndex((index) => (index + 1) % SCANNING_MESSAGES.length),
      2000,
    );
    return () => clearInterval(timer);
  }, [running, connecting]);
  useEffect(() => {
    const identity = params.sessionId ?? params.sourceUrl ?? '';
    if (!identity || mountedInput.current === identity) return;
    mountedInput.current = identity;
    if (params.sessionId) void extractionService.attach(params.sessionId);
    else if (params.sourceUrl) {
      const source = extractionUrl(params.sourceUrl);
      if (source && requireOnline(t)) {
        track('PIN_LINK_SUBMITTED', { source: 'share' });
        void extractionService.start(source);
      }
    }
  }, [params.sessionId, params.sourceUrl, t]);
  const pins: PinInput[] = (session?.pins ?? [])
    .filter((pin) => selected.includes(pin.index))
    .map((pin) => ({
      name: pin.name,
      address: pin.address,
      latitude: pin.latitude,
      longitude: pin.longitude,
      notes: pin.notes,
      category: pin.category,
      dayNumber: pin.dayNumber,
      timeOfDayText: pin.timeOfDayText,
      sourceTimestampSec: pin.sourceTimestampSec,
      sourceUrl: session?.sourceUrl,
    }));
  const saved = async (id: number) => {
    track('PINS_SAVED', { target: save, pinCount: pins.length });
    try {
      await extractionService.cancel();
    } catch {
      /* Saved pins remain valid; the session can be dismissed later. */
    }
    if (save === 'board') router.replace({ pathname: '/board/[boardId]', params: { boardId: id } });
    else router.replace({ pathname: '/trip/[tripId]', params: { tripId: id, tab: 'plan' } });
  };
  const failed = Boolean(error || session?.status === 'FAILED');
  const rows = flattenExtractionRows(session?.pins ?? []);
  // Pins already on screen when it opened (re-attaching to a session) appear in place; only pins
  // streamed in afterwards fade in — otherwise every freshly mounted cell replays the animation.
  const [mounted] = useState(() => ({ sessionId: session?.id, count: session?.pins.length ?? 0 }));
  const animateFrom = session?.id === mounted.sessionId ? mounted.count : 0;
  return (
    <ScreenContainer edges={[]}>
      <BoardNavigation floating onHeight={setNavHeight} />
      <FlashList
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        data={rows}
        keyExtractor={(row) => row.key}
        contentContainerStyle={{
          padding: 15,
          paddingTop: navHeight + 15,
          paddingBottom: 25 + barHeight,
        }}
        ListHeaderComponent={
          <View style={{ gap: 15, marginBottom: 15 }}>
            <View
              style={{
                backgroundColor: '#FFFFFF80',
                borderRadius: 20,
                padding: 16,
                gap: 8,
                boxShadow: '0px 0px 18px #00000017',
                borderWidth: running || connecting ? 0 : 2,
                borderColor: colors.blueBase,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: running || connecting ? 6 : 0,
                }}
              >
                {running || connecting ? <Stars width={18} height={18} /> : null}
                <Text style={{ ...beVietnamPro(15), color: colors.contentB }}>
                  {t(running || connecting ? SCANNING_MESSAGES[messageIndex]! : 'We found ')}
                </Text>
                {!running && !connecting ? (
                  <Text style={{ ...beVietnamPro(15, 'medium'), color: colors.blueBase }}>
                    {t('%lld pins in this post!', {
                      0: session?.pins.length ?? 0,
                      count: session?.pins.length ?? 0,
                    })}
                  </Text>
                ) : null}
              </View>
              <View style={{ height: 1, backgroundColor: '#335CFF1F' }} />
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <BoardCover uri={session?.videoMeta?.thumbnail} width={57} height={56} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text
                    numberOfLines={1}
                    style={{ ...beVietnamPro(15), letterSpacing: -0.75, color: colors.contentB }}
                  >
                    {session?.videoMeta?.description ??
                      session?.videoMeta?.title ??
                      t('Getting clip information...')}
                  </Text>
                  <Text style={{ ...beVietnamPro(14), color: colors.neutral600 }}>
                    {t(
                      (session?.sourceUrl ?? params.sourceUrl ?? '').includes('instagram')
                        ? 'From Instagram'
                        : 'From TikTok',
                    )}
                  </Text>
                </View>
              </View>
              {running || connecting ? <ExtractionBeam /> : null}
            </View>
            {failed ? (
              <View style={styles.card}>
                <Text style={styles.error}>
                  {t("Couldn't analyze this post, please try again")}
                </Text>
                <BoardButton
                  title={t('Try again')}
                  onPress={() => {
                    if (requireOnline(t))
                      void extractionService.start(params.sourceUrl ?? session?.sourceUrl ?? '');
                  }}
                />
              </View>
            ) : null}
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        getItemType={(row) => row.type}
        renderItem={({ item }) => (
          <Animated.View
            entering={
              reduced || item.order < animateFrom ? undefined : FadeInDown.duration(400).springify()
            }
          >
            {item.type === 'divider' ? (
              // The 8pt separator after this row makes up the rest of the 12pt gap to its pin.
              <View
                style={{
                  flexDirection: 'row',
                  gap: 10,
                  alignItems: 'center',
                  marginTop: 12,
                  marginBottom: 4,
                }}
              >
                <View style={{ height: 1, flex: 1, backgroundColor: colors.neutral200 }} />
                <Text style={{ ...beVietnamPro(13, 'medium'), color: colors.contentM }}>
                  {t('Day %lld', { 0: item.dayNumber })}
                </Text>
                <View style={{ height: 1, flex: 1, backgroundColor: colors.neutral200 }} />
              </View>
            ) : (
              <PinRow
                showsDay={false}
                testID={`extraction-pin-${item.pin.index}`}
                pin={item.pin}
                selected={selected.includes(item.pin.index)}
                onPress={() => usePinExtractionStore.getState().toggle(item.pin.index)}
              />
            )}
          </Animated.View>
        )}
        ListFooterComponent={running ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      />
      {/* Floats over the list with no background — pins scroll behind it, like the SwiftUI
          `safeAreaInset` toolbar. */}
      <View
        pointerEvents="box-none"
        onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingBottom: insets.bottom + 8,
          paddingHorizontal: 12,
          paddingTop: 10,
        }}
      >
        {running && !failed ? (
          <View
            style={{
              flexDirection: 'row',
              gap: 12,
              padding: 12,
              borderRadius: 20,
              backgroundColor: colors.black,
              alignItems: 'center',
            }}
          >
            <Image
              source={require('@/assets/images/board/processPinBackgroundIcon.png')}
              style={{ width: 42, height: 42, borderRadius: 14 }}
            />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ ...beVietnamPro(15), color: 'white' }}>{t('Run in background')}</Text>
              <Text style={{ ...beVietnamPro(14), color: 'white' }} numberOfLines={1}>
                {t('We’ll inform you when it’s done.')}
              </Text>
            </View>
            <BoardButton
              title={t('Close')}
              variant="secondary"
              style={{ height: 30, paddingHorizontal: 12 }}
              textStyle={beVietnamPro(14)}
              onPress={() => router.back()}
            />
          </View>
        ) : !running && session?.pins.length ? (
          <Animated.View
            entering={reduced ? undefined : FadeInDown.duration(280)}
            style={{ flexDirection: 'row', gap: 12 }}
          >
            <BoardButton
              style={{ flex: 1, paddingHorizontal: 10 }}
              variant="dark"
              title={t('Add to Boards')}
              disabled={!pins.length}
              onPress={() => setSave('board')}
            />
            <BoardButton
              style={{ flex: 1, paddingHorizontal: 10 }}
              title={t('Add to Trips')}
              disabled={!pins.length}
              onPress={() => setSave('trip')}
            />
          </Animated.View>
        ) : null}
      </View>
      {save ? (
        <SavePinsSheet
          target={save}
          pins={pins}
          onClose={() => setSave(null)}
          onSaved={(id) => void saved(id)}
          onGenerate={setGenerate}
        />
      ) : null}
      {generate ? (
        <GenerateTripSheet
          board={generate}
          asksForVibe={false}
          onClose={() => setGenerate(null)}
          onGenerated={(id) => {
            void extractionService.cancel().catch(() => undefined);
            router.replace({ pathname: '/trip/[tripId]', params: { tripId: id, tab: 'plan' } });
          }}
        />
      ) : null}
      {creditError ? (
        <CreditSheets
          creditError={creditError}
          onClose={() => {
            usePinExtractionStore.setState({ creditError: null });
          }}
        />
      ) : null}
    </ScreenContainer>
  );
}
