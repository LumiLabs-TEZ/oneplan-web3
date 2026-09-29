import { track } from '@/analytics/track';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/i18n';
import { useTabContentInsets } from '@/features/shell/useTabContentInsets';
import { ScreenContainer } from '@/ui/components';
import { svg } from '@/ui/assets';
import { usePinExtractionStore } from '@/sse/pinExtractionStore';
import { useBoards } from './api/queries';
import { BoardEditorSheet } from './components/BoardEditorSheet';
import { BoardRow } from './components/BoardRow';
import { QueryError, styles } from './components/common';
import { CreditSheets } from './components/CreditSheets';
import { ImportHero, CreateBoardRow } from './components/BoardEntry';
import { ActiveScanCard } from './components/ActiveScanCard';
import { usePinLauncher } from './usePinLauncher';
export default function BoardScreen() {
  useAppLanguage();
  const { t } = useTranslation();
  const boards = useBoards();
  const launcher = usePinLauncher();
  const session = usePinExtractionStore((s) => s.session);
  useEffect(() => {
    track('BOARD_OPENED');
  }, []);
  const [create, setCreate] = useState(false);
  const [credits, setCredits] = useState(false);
  const EmptyArt = svg.illustration.emptyBoard;
  const insets = useTabContentInsets();
  return (
    <ScreenContainer edges={[]}>
      <FlashList
        data={boards.data ?? []}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.content, { gap: 0 }, insets.contentStyle]}
        showsVerticalScrollIndicator={false}
        refreshing={boards.isRefetching}
        onRefresh={() => {
          void boards.refetch();
          void launcher.quota.refetch();
        }}
        ListHeaderComponent={
          <View style={{ gap: 20, marginBottom: 8 }}>
            {session ? (
              <ActiveScanCard />
            ) : (
              <ImportHero
                available={launcher.quota.data?.available}
                checking={launcher.checking}
                onPaste={() => void launcher.paste()}
                onCredits={() => setCredits(true)}
              />
            )}
            <Text style={styles.section}>{t('Your Boards')}</Text>
            {boards.isError ? <QueryError onRetry={() => void boards.refetch()} /> : null}
          </View>
        }
        ListEmptyComponent={
          <View
            style={[
              styles.card,
              { height: 321, alignItems: 'center', justifyContent: 'center', gap: 14 },
            ]}
          >
            <EmptyArt width={154} height={159} />
            <Text style={styles.section}>
              {t(boards.isPending ? 'Loading...' : 'No board created.')}
            </Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => (
          <BoardRow
            board={item}
            onPress={() =>
              router.push({ pathname: '/board/[boardId]', params: { boardId: item.id } })
            }
          />
        )}
        ListFooterComponent={
          <View style={{ marginTop: 8 }}>
            <CreateBoardRow onPress={() => setCreate(true)} />
          </View>
        }
      />
      {create ? (
        <BoardEditorSheet
          onClose={() => setCreate(false)}
          onSaved={(board) =>
            router.push({ pathname: '/board/[boardId]', params: { boardId: board.id } })
          }
        />
      ) : null}
      {credits || launcher.gate ? (
        <CreditSheets
          creditError={launcher.gate}
          onClose={() => {
            setCredits(false);
            launcher.closeGate();
          }}
        />
      ) : null}
    </ScreenContainer>
  );
}
