/**
 * QR invite screen — port of `InviteView.swift`. A pull-to-reveal scanner panel sits behind the
 * profile/QR/friends content; dragging (or tapping the toolbar label) reveals the camera so the
 * user can scan a friend's or a trip's QR code. `?scan=1` (from the FAB's "Scan QR" quick action)
 * reveals the scanner on mount, mirroring `openScannerOnAppear`.
 */
import * as Haptics from 'expo-haptics';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { FriendQrCard, InviteProfileCard, ScannerPanel } from '@/features/friends/components';
import { mutualLabel, useFriends } from '@/features/friends/api/queries';
import {
  canPanBegin,
  resolveGestureEnd,
  revealLabelKey,
} from '@/features/friends/helpers/pullToReveal';
import { useMe } from '@/features/me/useMe';
import { FriendRow } from '@/features/profile/components/FriendRow';
import { useAppLanguage } from '@/i18n';
import { parseScannedCode } from '@/links/scanCode';
import { ScreenContainer, Spinner } from '@/ui/components';
import { BackButton } from '@/ui/components/BackButton';
import { SFSymbol } from '@/ui/components/SFSymbol';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

/** Plain ease-out settle — no spring, so the panel never overshoots or bounces. */
const SETTLE = { duration: 250, easing: Easing.out(Easing.cubic) } as const;
const PANEL_MARGIN = 16;
const MAX_PANEL_SIZE = 360;
const REVEAL_GAP = 20;

export default function ProfileInviteScreen() {
  useAppLanguage();
  const { t } = useTranslation();
  const isFocused = useIsFocused();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ scan?: string }>();

  const me = useMe();
  const friends = useFriends();

  // `scan=1` reveals on mount — port of `openScannerOnAppear`. Read once (lazy initializer):
  // avoids a setState-in-effect cascade for what is really an initial-render decision.
  const [isRevealed, setIsRevealed] = useState(() => params.scan === '1');
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);

  const previewSize = Math.min(Math.max(0, width - PANEL_MARGIN * 2), MAX_PANEL_SIZE);
  const maxRevealOffset = previewSize + REVEAL_GAP;

  // `revealedSV` is the committed 0/1 flag the gesture worklets read; `progressSV` is the
  // animated 0..1 position the content/scanner render from (eases toward `revealedSV`).
  const revealedSV = useSharedValue(isRevealed ? 1 : 0);
  const progressSV = useSharedValue(isRevealed ? 1 : 0);
  const dragY = useSharedValue(0);
  // Friends-list scroll offset, written from the UI thread by the ScrollView's scroll handler —
  // `canPanBegin` reads it inside the Pan's `onUpdate` worklet to decide whether a given frame's
  // drag belongs to the reveal panel or to the list's own native scroll.
  const scrollOffsetSV = useSharedValue(0);
  // Whether `canPanBegin` has passed at least once during the current gesture — reset on
  // `onStart`, set in `onUpdate`. `onEnd` uses this (not a fresh `canPanBegin` check on the
  // release frame) to decide whether to toggle reveal state at all: touch-sample jitter can flip
  // `canPanBegin` false right at lift-off even though earlier frames legitimately claimed the
  // drag, and gating the toggle on a re-check there — as the first cut of this gesture did —
  // meant `dragY`'s settle-back lived inside that same guard and could be skipped entirely,
  // leaving the panel stuck mid-drag. The settle-back below now always runs; only the toggle is
  // gated.
  const everPassedSV = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollOffsetSV.set(event.contentOffset.y);
  });

  // Commits reveal state (React + worklet flag) and fires the haptic. The position animation is
  // started by the caller: `onEnd` eases `progressSV` on the UI thread from the release offset,
  // `toggleReveal` eases it from wherever it currently is.
  const reveal = useCallback(
    (next: boolean) => {
      setIsRevealed(next);
      revealedSV.set(next ? 1 : 0);
      if (next) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    },
    [revealedSV],
  );

  // Fires the reveal haptic for the `scan=1` initial-mount case — a shared-value write isn't
  // React state, so this doesn't trip the setState-in-effect rule the way calling `reveal()`
  // (or `setIsRevealed`) here would.
  useEffect(() => {
    if (isRevealed)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleReveal = useCallback(() => {
    const next = !isRevealed;
    progressSV.set(withTiming(next ? 1 : 0, SETTLE));
    reveal(next);
  }, [isRevealed, progressSV, reveal]);

  // The list's native scroll gesture — the Pan below runs *simultaneously* with it (both get the
  // touch stream) rather than fighting it for ownership. `activeOffsetY`/`failOffsetX` keep the
  // Pan from activating on small jitters or horizontal swipes; `canPanBegin` (worklet-safe, pure,
  // unit-tested in `pullToReveal.ts`) decides per-frame whether *this* drag belongs to the reveal
  // panel (pulling down from the top of the list, or pushing up while revealed) or should be left
  // untouched so the ScrollView scrolls normally.
  const nativeScrollGesture = useMemo(() => Gesture.Native(), []);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(8)
        .activeOffsetY([-12, 12])
        .failOffsetX([-10, 10])
        .simultaneousWithExternalGesture(nativeScrollGesture)
        .onStart(() => {
          'worklet';
          everPassedSV.set(0);
        })
        .onUpdate((event) => {
          'worklet';
          if (!canPanBegin(revealedSV.get() === 1, scrollOffsetSV.get(), event.translationY))
            return;
          everPassedSV.set(1);
          dragY.set(event.translationY);
        })
        .onEnd((event) => {
          'worklet';
          // Fold the (clamped) drag into `progressSV` in one frame so there's no jump, then
          // ease a single value to the target — like iOS animating `activeOffset`. Springing
          // `dragY` back to 0 while the base offset snapped to its new value (the first cut) made
          // the content overshoot past the target and bounce back. Unconditional: an un-claimed
          // gesture leaves dragY at 0, so this just re-settles toward the unchanged state.
          const maxOffset = maxRevealOffset > 0 ? maxRevealOffset : 1;
          const offset = Math.min(
            Math.max(progressSV.get() * maxOffset + dragY.get(), 0),
            maxOffset,
          );
          dragY.set(0);
          progressSV.set(offset / maxOffset);
          // Only toggle (and fire the haptic) when this gesture actually claimed the drag at some
          // point — every list-only scroll also runs this Pan's `onEnd` (they're composed via
          // `simultaneousWithExternalGesture`), and re-committing the unchanged state would still
          // re-fire the reveal haptic on every scroll interaction while the panel is open.
          if (everPassedSV.get() !== 1) {
            progressSV.set(withTiming(revealedSV.get(), SETTLE));
            return;
          }
          const next = resolveGestureEnd(
            true,
            revealedSV.get() === 1,
            event.translationY,
            event.velocityY,
          );
          progressSV.set(withTiming(next ? 1 : 0, SETTLE));
          runOnJS(reveal)(next);
        }),
    [
      dragY,
      everPassedSV,
      maxRevealOffset,
      nativeScrollGesture,
      progressSV,
      reveal,
      revealedSV,
      scrollOffsetSV,
    ],
  );

  // Clamped to [0, maxRevealOffset] like iOS `activeOffset` — no over-pull past the scanner.
  const contentStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: Math.min(
          Math.max(progressSV.get() * maxRevealOffset + dragY.get(), 0),
          maxRevealOffset,
        ),
      },
    ],
  }));

  // Port of the scanner's `.opacity(revealProgress)` — fades in with the pull.
  const scannerStyle = useAnimatedStyle(() => {
    if (maxRevealOffset <= 0) return { opacity: 0 };
    const offset = progressSV.get() * maxRevealOffset + dragY.get();
    return { opacity: Math.min(Math.max(offset / maxRevealOffset, 0), 1) };
  });

  const handleCode = useCallback((raw: string) => {
    const result = parseScannedCode(raw);
    if (!result) {
      setLastScannedCode(raw);
      return;
    }
    if (result.kind === 'friend') {
      router.push({ pathname: '/friend/[code]', params: { code: result.code } });
    } else {
      router.push({ pathname: '/join/[code]', params: { code: result.code } });
    }
  }, []);

  const friendList = friends.data ?? [];

  return (
    <ScreenContainer>
      <View style={styles.root} testID="invite-screen">
        <View style={styles.toolbar}>
          {/* iOS gets its back chevron free from the `NavigationStack` bar (`InviteView.swift`
           * only customizes the `.principal` toolbar item). This stack runs `headerShown: false`,
           * and the pull-to-reveal `Gesture.Pan()` below swallows the interactive-pop edge swipe,
           * so without an explicit button this screen is a dead end. */}
          <View style={styles.backButton}>
            <BackButton testID="invite-back" />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(revealLabelKey(isRevealed))}
            testID="invite-toggle-scanner"
            onPress={toggleReveal}
            style={styles.toolbarButton}
          >
            <Text style={styles.toolbarLabel}>{t(revealLabelKey(isRevealed))}</Text>
            <SFSymbol
              name={isRevealed ? 'chevron.up' : 'qrcode.viewfinder'}
              fallback={isRevealed ? 'chevron-up' : 'scan-outline'}
              size={16}
              frame={20}
              color={colors.contentM}
            />
          </Pressable>
        </View>

        <View style={styles.body}>
          <Animated.View
            style={[styles.scannerLayer, scannerStyle]}
            pointerEvents={isRevealed ? 'auto' : 'none'}
          >
            <ScannerPanel active={isRevealed && isFocused} size={previewSize} onCode={handleCode} />
          </Animated.View>

          <GestureDetector gesture={pan}>
            <Animated.View style={[styles.content, contentStyle]}>
              <GestureDetector gesture={nativeScrollGesture}>
                <Animated.ScrollView
                  onScroll={scrollHandler}
                  scrollEventThrottle={16}
                  // The pan owns the pull at the top; a list rubber-band on top of it doubles the
                  // motion (iOS `InviteView` content is a plain VStack with no bounce).
                  bounces={false}
                  contentContainerStyle={styles.scrollContent}
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.surface}>
                    <InviteProfileCard name={me.data?.displayName} avatarUrl={me.data?.avatarUrl} />
                    <FriendQrCard
                      friendCode={me.data?.friendCode}
                      lastScannedCode={lastScannedCode}
                    />
                  </View>

                  <View style={[styles.surface, styles.friendsCard]}>
                    <Text style={styles.friendsHeader}>
                      {t('Friends')} · {t('%lld friends', { count: friendList.length })}
                    </Text>
                    {friends.isLoading ? (
                      <Spinner />
                    ) : (
                      friendList.map((friend) => (
                        <FriendRow
                          key={friend.friendshipId}
                          size={42}
                          style={styles.friendRow}
                          name={friend.user.displayName}
                          subtitle={mutualLabel(friend.mutualFriendCount, t)}
                          avatarUrl={friend.user.avatarUrl}
                          isPro={friend.user.isPro}
                        />
                      ))
                    )}
                  </View>
                </Animated.ScrollView>
              </GestureDetector>
            </Animated.View>
          </GestureDetector>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // The back button is absolutely positioned so the reveal label stays optically centered,
  // matching iOS's `.principal` toolbar placement next to the system back chevron.
  toolbar: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  // Inset by the toolbar's padding so the button centers on the label, not the padded box.
  backButton: {
    position: 'absolute',
    left: spacing.lg,
    top: spacing.sm,
    bottom: spacing.lg,
    justifyContent: 'center',
  },
  toolbarButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toolbarLabel: { ...beVietnamPro(14), color: colors.contentM },
  body: { flex: 1 },
  scannerLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: spacing.lg,
  },
  content: { flex: 1, paddingHorizontal: spacing.lg },
  scrollContent: { gap: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xxxl },
  surface: {
    backgroundColor: colors.surface,
    borderRadius: 32,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  // `InviteView` friends card: `.padding()` (16), VStack(spacing: 12), 42pt rows, no row inset.
  friendsCard: { padding: spacing.lg, gap: spacing.md },
  friendsHeader: { ...beVietnamPro(14), color: colors.contentM },
  friendRow: { paddingHorizontal: 0 },
});
