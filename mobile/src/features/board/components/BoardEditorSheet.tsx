import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';
import Stars from '@/assets/images/board/processPinStars.svg';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useAppLanguage } from '@/i18n';
import { keys } from '@/api/keys';
import { mutationErrorMessage } from '@/api/mutationError';
import { requireOnline } from '@/offline/guardOnline';
import { pickImage } from '@/native/imagePick';
import { uploadImage } from '@/uploads/uploadService';

import type { LocationSearchResultDto } from '@/features/location/api/queries';
import { createBoard, updateBoard, generateDescription } from '../api/mutations';
import type { Board, BoardSummary } from '../types';
import { BoardButton, BoardSheet, styles } from './common';
import { DestinationField, destinationIds } from './DestinationField';
export function BoardEditorSheet({
  board,
  onClose,
  onSaved,
  stackBehavior,
}: {
  board?: Board;
  onClose: () => void;
  onSaved: (board: BoardSummary) => void;
  stackBehavior?: 'push';
}) {
  useAppLanguage();
  const { t } = useTranslation();
  const client = useQueryClient();
  const [title, setTitle] = useState(board?.title ?? '');
  const [description, setDescription] = useState(board?.description ?? '');
  const [location, setLocation] = useState<LocationSearchResultDto | null>(null);
  const [cover, setCover] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Retain the newly-created board if only its cover upload failed, so Retry cannot create a duplicate.
  const saved = useRef<BoardSummary | null>(null);
  const hasLocation = Boolean(location || board?.countryId || board?.stateId || board?.cityId);
  const save = async () => {
    if (!title.trim() || !hasLocation || busy || !requireOnline(t)) return;
    setBusy(true);
    setError('');
    try {
      const body = {
        title: title.trim(),
        description: description.trim(),
        ...destinationIds(location),
      };
      const result = board
        ? await updateBoard(board.id, body)
        : saved.current
          ? await updateBoard(saved.current.id, body)
          : await createBoard(body);
      saved.current = result;
      if (cover) await uploadImage({ uri: cover, target: 'board-cover', entityId: result.id });
      await client.invalidateQueries({ queryKey: keys.board.all });
      onSaved(result);
      onClose();
    } catch (e) {
      setError(mutationErrorMessage(e, t('Something went wrong')));
    } finally {
      setBusy(false);
    }
  };
  return (
    <BoardSheet
      title={t(board ? 'Edit Board' : 'Create new Board')}
      height={500}
      onClose={onClose}
      stackBehavior={stackBehavior}
    >
      <View style={{ gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Change cover')}
          disabled={busy}
          style={{
            alignSelf: 'center',
            width: 100,
            height: 120,
            borderRadius: 20,
            backgroundColor: 'white',
            borderWidth: cover || board?.coverImageUrl ? 0 : 1,
            borderStyle: 'dashed',
            borderColor: '#00000040',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0px 0px 12px #335CFF33',
            overflow: 'hidden',
          }}
          onPress={async () => {
            try {
              const uri = await pickImage();
              if (uri) setCover(uri);
            } catch {
              setError(t('Something went wrong'));
            }
          }}
        >
          {cover || board?.coverImageUrl ? (
            <CachedImage uri={cover ?? board?.coverImageUrl} style={{ width: 100, height: 120 }} />
          ) : (
            <Ionicons name="images-outline" size={24} color={colors.blueBase} />
          )}
        </Pressable>
        <View style={{ gap: 4 }}>
          <View
            style={[
              styles.row,
              { backgroundColor: 'white', borderRadius: 20, paddingHorizontal: 16, height: 48 },
            ]}
          >
            <Text style={{ ...beVietnamPro(15), color: colors.contentM }}>{t('Board name')}</Text>
            <BottomSheetTextInput
              testID="board-name-input"
              autoCorrect={false}
              style={{
                ...beVietnamPro(15),
                color: colors.contentB,
                flex: 1,
                textAlign: 'right',
                height: 48,
              }}
              value={title}
              onChangeText={setTitle}
              maxLength={120}
              placeholder={t('Enter name')}
            />
          </View>
          <DestinationField value={location} onChange={setLocation} label={board?.locationLabel} />
          <View
            style={{
              backgroundColor: 'white',
              borderRadius: 20,
              paddingHorizontal: 16,
              paddingVertical: 14,
              gap: 10,
            }}
          >
            <View style={styles.row}>
              <Text style={{ ...beVietnamPro(15), color: colors.contentM, flex: 1 }}>
                {t('Description')}
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={!hasLocation || !title.trim() || busy}
                style={[
                  styles.row,
                  {
                    gap: 4,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 99,
                    backgroundColor: colors.neutral100,
                    opacity: hasLocation && title.trim() ? 1 : 0.5,
                  },
                ]}
                onPress={async () => {
                  if (!requireOnline(t)) return;
                  setBusy(true);
                  try {
                    setDescription(
                      await generateDescription({
                        title: title.trim(),
                        countryName:
                          location?.country.name ??
                          board?.locationLabel?.split(',').at(-1)?.trim() ??
                          '',
                        cityName: location?.city?.name,
                        stateName: location?.state?.name,
                      }),
                    );
                  } catch (e) {
                    setError(mutationErrorMessage(e, t('Something went wrong')));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Stars width={14} height={14} />
                <Text style={{ ...beVietnamPro(12, 'medium'), color: colors.contentM }}>
                  {t('Made by AI')}
                </Text>
              </Pressable>
            </View>
            <BottomSheetTextInput
              testID="board-description"
              style={{
                ...beVietnamPro(14),
                color: colors.contentB,
                minHeight: 55,
                textAlignVertical: 'top',
              }}
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={2000}
              placeholder={t('Tap “Made by AI” to generate, or write your own…')}
            />
          </View>
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <BoardButton
        testID="board-save"
        title={t(board ? 'Save changes' : 'Save new Board')}
        loading={busy}
        disabled={!title.trim() || !hasLocation}
        onPress={save}
      />
    </BoardSheet>
  );
}
