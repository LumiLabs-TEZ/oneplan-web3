/**
 * Port of `Component/Home/YourBoardsSection.swift`: "Your Boards" header with
 * a "See all" action above the user's board rows, in server order. Data is
 * fetched by the Home screen (iOS `boardService.boards`).
 */
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, type StyleProp, View, type ViewStyle } from 'react-native';

import { BoardRow } from '@/features/board/components/BoardRow';
import type { BoardSummary } from '@/features/board/types';
import { useAppLanguage } from '@/i18n';
import { SectionHeader } from '@/ui/components/SectionHeader';
import { spacing } from '@/ui/theme';

export interface YourBoardsSectionProps {
  boards: readonly BoardSummary[];
  onSeeAll: () => void;
  style?: StyleProp<ViewStyle>;
}

export function YourBoardsSection({ boards, onSeeAll, style }: YourBoardsSectionProps) {
  useAppLanguage();
  const { t } = useTranslation();

  if (boards.length === 0) return null;

  return (
    <View style={[styles.section, style]}>
      <SectionHeader title={t('Your Boards')} action={{ label: t('See all'), onPress: onSeeAll }} />
      {boards.map((board) => (
        <BoardRow
          key={board.id}
          board={board}
          onPress={() =>
            router.push({ pathname: '/board/[boardId]', params: { boardId: board.id } })
          }
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
});
