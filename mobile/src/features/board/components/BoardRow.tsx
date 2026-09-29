import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/i18n';
import { CachedImage } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';
import PinIcon from '@/assets/images/board/boardPinIcon.svg';
import Compass from '@/assets/images/board/boardCompassIcon.svg';
import type { BoardSummary } from '../types';
const placeholder = require('@/assets/images/board/boardPlaceholder.png');
export function BoardCover({
  uri,
  width = 100,
  height = 120,
}: {
  uri?: string;
  width?: number;
  height?: number;
}) {
  const [failedUri, setFailedUri] = useState<string>();
  return (
    <CachedImage
      uri={failedUri === uri ? undefined : uri}
      onError={() => setFailedUri(uri)}
      style={{ width, height, borderRadius: 16 }}
      contentFit="cover"
      placeholder={
        <Image
          source={placeholder}
          style={{ width, height, borderRadius: 16 }}
          contentFit="cover"
        />
      }
    />
  );
}
export const BoardRow = memo(function BoardRow({
  board,
  onPress,
  variant = 'list',
  selected = false,
}: {
  board: BoardSummary;
  onPress: () => void;
  variant?: 'list' | 'picker' | 'detail';
  selected?: boolean;
}) {
  useAppLanguage();
  const { t } = useTranslation();
  const location =
    variant === 'detail' ? board.locationLabel : board.locationLabel?.split(',')[0]?.trim();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      testID={`board-row-${board.id}`}
      style={[
        s.row,
        { borderRadius: variant === 'picker' ? 24 : 20, gap: variant === 'picker' ? 10 : 8 },
        selected && s.selected,
      ]}
    >
      <BoardCover
        uri={board.coverImageUrl}
        width={variant === 'detail' ? 92 : 100}
        height={variant === 'detail' ? 112 : 120}
      />
      <View
        style={[s.content, variant === 'picker' && { minHeight: 120, justifyContent: 'center' }]}
      >
        <Text style={s.title} numberOfLines={variant === 'list' ? 1 : 2}>
          {board.title}
        </Text>
        {board.description ? (
          <Text
            style={[s.description, variant === 'detail' && { letterSpacing: -0.65 }]}
            numberOfLines={variant === 'detail' ? 3 : 2}
          >
            {board.description}
          </Text>
        ) : null}
        <View
          style={[
            s.meta,
            variant !== 'detail' && {
              padding: 12,
              height: 46,
              borderRadius: 12,
              backgroundColor: colors.neutral50,
            },
            variant === 'picker' && { justifyContent: 'center' },
          ]}
        >
          {variant !== 'detail' ? (
            <>
              <PinIcon width={16} height={16} />
              <Text style={s.metaText}>{t('%lld pins', { count: board.pinCount })}</Text>
              {location ? <View style={s.divider} /> : null}
            </>
          ) : null}
          {location ? (
            <View style={[s.location, variant === 'detail' && s.pill]}>
              <Compass width={16} height={16} />
              <Text style={s.metaText} numberOfLines={1}>
                {location}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});
const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    padding: 8,
    backgroundColor: colors.surface,
    alignItems: 'flex-start',
  },
  selected: { borderWidth: 1, borderColor: colors.blueBase },
  content: { flex: 1, gap: 8 },
  title: { ...beVietnamPro(18), color: colors.neutral950 },
  description: { ...beVietnamPro(13), color: colors.neutral950, lineHeight: 19 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { ...beVietnamPro(15), color: colors.neutral700, flexShrink: 1 },
  location: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  pill: {
    backgroundColor: colors.neutral50,
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  divider: { height: 22, width: 1, backgroundColor: colors.neutral100, marginHorizontal: 4 },
});
