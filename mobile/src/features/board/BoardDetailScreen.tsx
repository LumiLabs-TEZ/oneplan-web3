import { Ionicons } from '@expo/vector-icons';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';
import { BoardRow } from './components/BoardRow';
import { BoardButton, BoardNavigation, QueryError, styles } from './components/common';
import { PinDetailSheet } from './components/PinDetailSheet';
import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useAppLanguage } from '@/i18n';
import { keys } from '@/api/keys';
import { mutationErrorMessage } from '@/api/mutationError';
import { requireOnline } from '@/offline/guardOnline';
import { ScreenContainer, Button, NumericText } from '@/ui/components';
import { useBoard } from './api/queries';
import { deleteBoard, deletePin } from './api/mutations';
import { BoardEditorSheet } from './components/BoardEditorSheet';
import { GenerateTripSheet } from './components/GenerateTripSheet';
import { SavePinsSheet } from './components/SavePinsSheet';
import { PinRow } from './components/PinRow';
import { CollapsingRow } from './components/CollapsingRow';
import type { Board, BoardPin, PinInput } from './types';
export default function BoardDetailScreen() {
  useAppLanguage();
  const { t } = useTranslation();
  const { boardId } = useLocalSearchParams<{ boardId: string }>();
  const query = useBoard(Number(boardId));
  const board = query.data;
  const client = useQueryClient();
  const [pinDetail, setPinDetail] = useState<BoardPin | null>(null);
  const [edit, setEdit] = useState(false);
  const [generate, setGenerate] = useState<Board | null>(null);
  const [save, setSave] = useState<PinInput[] | null>(null);
  const [busy, setBusy] = useState(false);
  // Pins mid-delete: their rows collapse while the request runs, then leave the cached board.
  const [removing, setRemoving] = useState<ReadonlySet<number>>(new Set());
  // Only a user pull shows the refresh spinner — tying it to `isRefetching` made every background
  // refetch (e.g. after a delete) pop the spinner in and shove the list down.
  const [pulling, setPulling] = useState(false);
  const setPinRemoving = (pinId: number, on: boolean) =>
    setRemoving((current) => {
      const next = new Set(current);
      if (on) next.add(pinId);
      else next.delete(pinId);
      return next;
    });
  const dropPin = (pinId: number) => {
    if (!board) return;
    client.setQueryData<Board>(keys.board.detail(board.id), (current) =>
      current ? { ...current, pins: current.pins.filter((pin) => pin.id !== pinId) } : current,
    );
    setPinRemoving(pinId, false);
  };
  const removePin = async (pinId: number) => {
    if (!board) return;
    setPinRemoving(pinId, true);
    try {
      await deletePin(board.id, pinId);
      // The collapse already dropped the pin locally; refetching this board now could land
      // mid-animation and yank the row, so refresh only the other board queries (lists, counts).
      await client.invalidateQueries({
        queryKey: keys.board.all,
        predicate: (q) => q.queryKey[1] !== board.id,
      });
    } catch (e) {
      setPinRemoving(pinId, false);
      void client.invalidateQueries({ queryKey: keys.board.detail(board.id) });
      Alert.alert(mutationErrorMessage(e, t('Something went wrong')));
    }
  };
  const remove = (pinId?: number) => {
    if (!board || busy || !requireOnline(t)) return;
    Alert.alert(t(pinId ? 'Delete pin?' : 'Delete board?'), undefined, [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Delete'),
        style: 'destructive',
        onPress: async () => {
          if (!requireOnline(t)) return;
          if (pinId) return removePin(pinId);
          setBusy(true);
          try {
            await deleteBoard(board.id);
            await client.invalidateQueries({ queryKey: keys.board.all });
            router.back();
          } catch (e) {
            Alert.alert(mutationErrorMessage(e, t('Something went wrong')));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };
  return (
    <ScreenContainer edges={[]}>
      <BoardNavigation
        trailing={
          <Button
            variant="toolbarIcon"
            accessibilityLabel={t('Delete board?')}
            testID="board-delete"
            disabled={busy}
            onPress={() => remove()}
            icon={<Ionicons name="trash-outline" size={20} color={colors.warning500} />}
          />
        }
      />
      <FlashList
        showsVerticalScrollIndicator={false}
        data={board?.pins ?? []}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 22 }}
        refreshing={pulling}
        onRefresh={() => {
          setPulling(true);
          void query.refetch().finally(() => setPulling(false));
        }}
        ListHeaderComponent={
          <View style={{ gap: 18, marginBottom: 18 }}>
            <View style={{ paddingTop: 24, paddingBottom: 4, alignItems: 'center' }}>
              <NumericText
                value={board?.pins.length ?? 0}
                style={{
                  fontSize: 64,
                  fontWeight: '700',
                  color: colors.neutral950,
                  fontFamily: 'System',
                  textShadowColor: '#3636361C',
                  textShadowRadius: 7.5,
                }}
              />
              <Text style={{ ...beVietnamPro(20), letterSpacing: -0.8, color: colors.neutral950 }}>
                {t('Pins on this board')}
              </Text>
            </View>
            {board ? (
              <BoardRow
                board={{ ...board, pinCount: board.pins.length }}
                variant="detail"
                onPress={() => setEdit(true)}
              />
            ) : null}
            {board?.pins.length ? (
              <BoardButton
                testID="board-generate"
                title={t('Generate me a trip')}
                icon={<Ionicons name="sparkles" size={16} color="white" />}
                style={{ borderRadius: 18 }}
                onPress={() => {
                  if (!board.countryId) {
                    Alert.alert(
                      t('Add a location first'),
                      t(
                        'This board needs a location before you can generate a trip. Tap the board to edit it and add one.',
                      ),
                    );
                    return;
                  }
                  setGenerate(board);
                }}
              />
            ) : null}
            {query.isError ? <QueryError onRetry={() => void query.refetch()} /> : null}
          </View>
        }
        ListEmptyComponent={
          query.isPending ? <Text style={styles.muted}>{t('Loading...')}</Text> : null
        }
        renderItem={({ item, index }) => (
          // Row spacing lives inside the collapsing row (not a separator) so it closes with it.
          // No React `key` here: FlashList recycles the cell, and both rows reset per `itemKey`.
          <CollapsingRow
            itemKey={item.id}
            collapsed={removing.has(item.id)}
            onCollapsed={() => dropPin(item.id)}
            style={{ paddingBottom: 8 }}
          >
            <PinSwipeRow itemKey={item.id} onDelete={() => remove(item.id)}>
              <PinRow
                testID={`board-pin-${index}`}
                pin={item}
                onPress={() => {
                  if (item.latitude != null && item.longitude != null) setPinDetail(item);
                }}
              />
            </PinSwipeRow>
          </CollapsingRow>
        )}
      />
      {pinDetail ? (
        <PinDetailSheet
          pin={pinDetail}
          onClose={() => setPinDetail(null)}
          onAdd={() => {
            setSave([pinDetail]);
            setPinDetail(null);
          }}
          onDelete={() => {
            remove(pinDetail.id);
            setPinDetail(null);
          }}
        />
      ) : null}
      {edit && board ? (
        <BoardEditorSheet board={board} onClose={() => setEdit(false)} onSaved={() => undefined} />
      ) : null}
      {generate ? (
        <GenerateTripSheet
          board={generate}
          onClose={() => setGenerate(null)}
          onGenerated={(id) =>
            router.replace({ pathname: '/trip/[tripId]', params: { tripId: id, tab: 'plan' } })
          }
        />
      ) : null}
      {save ? (
        <SavePinsSheet
          target="trip"
          pins={save}
          onClose={() => setSave(null)}
          onSaved={(id) =>
            router.push({ pathname: '/trip/[tripId]', params: { tripId: id, tab: 'plan' } })
          }
          onGenerate={setGenerate}
        />
      ) : null}
    </ScreenContainer>
  );
}

/**
 * Swipe-to-delete wrapper for a recycled pin cell. The swipeable keeps its open offset in shared
 * values, so when the cell is handed a different pin it snaps shut instead of showing the new pin
 * half-swiped.
 */
function PinSwipeRow({
  itemKey,
  onDelete,
  children,
}: {
  itemKey: number;
  onDelete: () => void;
  children: ReactNode;
}) {
  useAppLanguage();
  const { t } = useTranslation();
  const swipeable = useRef<SwipeableMethods>(null);
  const open = useRef(false);
  const shownKey = useRef(itemKey);
  useEffect(() => {
    if (shownKey.current === itemKey) return;
    shownKey.current = itemKey;
    if (!open.current) return;
    open.current = false;
    // `reset` zeroes the offset instantly; `close` then settles the action opacity and tap state.
    swipeable.current?.reset();
    swipeable.current?.close();
  }, [itemKey]);
  return (
    <Swipeable
      ref={swipeable}
      onSwipeableWillOpen={() => {
        open.current = true;
      }}
      onSwipeableWillClose={() => {
        open.current = false;
      }}
      renderRightActions={() => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Delete')}
          onPress={onDelete}
          style={{
            width: 72,
            marginLeft: 8,
            borderRadius: 20,
            backgroundColor: colors.warning500,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Ionicons name="trash" size={24} color="white" />
        </Pressable>
      )}
    >
      {children}
    </Swipeable>
  );
}
