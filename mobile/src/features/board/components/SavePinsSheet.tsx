import { destinationIds } from './DestinationField';
import { BoardEditorSheet } from './BoardEditorSheet';
import { Image } from 'expo-image';
import Compass from '@/assets/images/board/boardCompassIcon.svg';
import { BoardRow } from './BoardRow';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';
import type { LocationSearchResultDto } from '@/features/location/api/queries';
import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/i18n';
import { keys } from '@/api/keys';
import { mutationErrorMessage } from '@/api/mutationError';
import { useTrips } from '@/features/trip/api/queries';
import { useMe } from '@/features/me/useMe';
import { createPlanItem, invalidatePlanItems } from '@/features/plan/api/mutations';
import { requireOnline } from '@/offline/guardOnline';
import { useBoards } from '../api/queries';
import { addPins, createBoard } from '../api/mutations';
import { pinPlanItems } from '../helpers/schedule';
import type { Board, PinInput } from '../types';
import { BoardButton, BoardSheet, QueryError, styles } from './common';

export function SavePinsSheet({
  target,
  pins,
  onClose,
  onSaved,
  onGenerate,
}: {
  target: 'board' | 'trip';
  pins: PinInput[];
  onClose: () => void;
  onSaved: (id: number) => void;
  onGenerate: (board: Board) => void;
}) {
  useAppLanguage();
  const { t } = useTranslation();
  const client = useQueryClient();
  const boards = useBoards();
  const trips = useTrips();
  const me = useMe();
  const name = '';
  const [creating, setCreating] = useState(false);
  const location: LocationSearchResultDto | null = null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const progress = useRef(new Map<number, number>());
  const createdBoard = useRef<number | null>(null);
  const save = async (id?: number) => {
    if (busy || !pins.length || !requireOnline(t)) return;
    if (target === 'trip' && id && !me.data) return;
    if (!id && target === 'board' && (!name.trim() || !location)) return;
    setBusy(true);
    setError('');
    try {
      if (target === 'trip' && id) {
        const items = pinPlanItems(pins, me.data!.id);
        // Retry resumes after confirmed writes. Never re-add the successfully saved prefix.
        try {
          for (let index = progress.current.get(id) ?? 0; index < items.length; index++) {
            await createPlanItem(id, items[index]!);
            progress.current.set(id, index + 1);
          }
        } finally {
          await invalidatePlanItems(client, id);
        }
        onSaved(id);
      } else {
        let boardId = id ?? createdBoard.current;
        if (!boardId) {
          const board = await createBoard({
            title: name.trim() || t('New board'),
            ...destinationIds(location),
          });
          boardId = board.id;
          createdBoard.current = boardId;
        }
        const board = await addPins(boardId, pins);
        await client.invalidateQueries({ queryKey: keys.board.all });
        if (target === 'trip') onGenerate(board);
        else onSaved(board.id);
      }
      onClose();
    } catch (e) {
      setError(mutationErrorMessage(e, t('Failed to add pins to trip.')));
    } finally {
      setBusy(false);
    }
  };
  const query = target === 'board' ? boards : trips;
  // The editor stacks on top of the picker — never swap the picker out: unmounting it dismisses its
  // sheet, and that `onDismiss` closes this whole flow. It must `push`: gorhom 5.2.14's default
  // `switch` minimizes the picker, but `onChange(-1)` marks it MINIMIZED before `onClose` runs, so
  // the minimize is treated as a dismiss and fires the picker's `onDismiss` anyway.
  const editor = creating ? (
    <BoardEditorSheet
      stackBehavior="push"
      onClose={() => setCreating(false)}
      onSaved={(board) => {
        void save(board.id);
      }}
    />
  ) : null;
  return (
    <>
      <BoardSheet
        title={t(target === 'board' ? 'Adding to Board' : 'Adding to trip')}
        height={target === 'board' ? 640 : 749}
        onClose={onClose}
        footer={
          target === 'trip' ? (
            <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
              <BoardButton
                testID="pins-new-trip"
                title={t('New Trip')}
                disabled={busy}
                loading={busy}
                onPress={() => save()}
              />
            </View>
          ) : undefined
        }
      >
        <Text
          style={[styles.muted, { color: colors.neutral950, textAlign: 'center', marginTop: -12 }]}
        >
          {t(
            target === 'board'
              ? 'Please select a board to apply to.'
              : 'Please select a trip to apply to.',
          )}
        </Text>
        {query.isError ? <QueryError onRetry={() => void query.refetch()} /> : null}
        <Text style={styles.section}>{t(target === 'board' ? 'Your Boards' : 'Your trips')}</Text>
        {target === 'board' ? (
          <View style={{ gap: 8 }}>
            {boards.data?.map((board) => (
              <BoardRow
                key={board.id}
                board={board}
                variant="picker"
                onPress={() => {
                  if (!busy) void save(board.id);
                }}
              />
            ))}
            <Pressable
              accessibilityRole="button"
              testID="pins-create-board"
              onPress={() => setCreating(true)}
              disabled={busy}
              style={{
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: colors.blueBase,
                backgroundColor: colors.blueAlpha10,
                borderRadius: 16,
                padding: 16,
              }}
            >
              <Text style={{ ...beVietnamPro(17), color: colors.blueBase, letterSpacing: -0.85 }}>
                {t('Create new Board')}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            {trips.data
              ?.filter((trip) => trip.status !== 'ENDED')
              .map((trip) => (
                <Pressable
                  key={trip.id}
                  testID={`pins-trip-${trip.id}`}
                  accessibilityRole="button"
                  disabled={busy || !me.data}
                  onPress={() => save(trip.id)}
                  style={{ width: '46%', gap: 12, height: 205 }}
                >
                  <View
                    style={{
                      width: '100%',
                      aspectRatio: 1,
                      maxWidth: 170,
                      borderRadius: 20,
                      overflow: 'hidden',
                      borderWidth: 3,
                      borderColor: colors.neutral100,
                    }}
                  >
                    <Image
                      source={require('@/assets/images/board/addingPinSingapore.png')}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                    />
                    <Text
                      style={{
                        position: 'absolute',
                        top: 5,
                        right: 5,
                        ...beVietnamPro(12, 'medium'),
                        color: colors.neutral700,
                        backgroundColor: colors.neutral100,
                        borderRadius: 99,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                      }}
                    >
                      {t(trip.status === 'ONGOING' ? 'Ongoing' : 'Planning')}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
                    <Compass width={14} height={14} />
                    <Text
                      numberOfLines={1}
                      style={{
                        ...beVietnamPro(14),
                        color: colors.contentB,
                        letterSpacing: -0.28,
                        flex: 1,
                      }}
                    >
                      {trip.name}
                    </Text>
                  </View>
                </Pressable>
              ))}
          </View>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </BoardSheet>
      {editor}
    </>
  );
}
