/**
 * Port of `MarketplaceFilterStrip.swift` — Duration / Companion / Budget chips that open the
 * menu (`AppMenuView` → native UIMenu on iOS, SwiftUI-styled popover on Android). Chip geometry
 * mirrors `filterChipLabel` (Neutral100 rim, white 0.92 fill, 16pt icon + Be Vietnam Pro 15).
 */
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { FeedFilters } from '../api/queries';
import {
  applyFilterChoice,
  filterChipTitle,
  filterChoices,
  isFilterSelected,
  type MarketFilterKind,
} from '../helpers/filters';
import { useAppLanguage } from '@/i18n';
import { svg } from '@/ui/assets';
import { AppMenuView, type AppMenuAction } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

const FILTER_KINDS: readonly MarketFilterKind[] = ['duration', 'companions', 'budget'];

export function MarketplaceFilterStrip({
  filters,
  onChange,
}: {
  filters: FeedFilters;
  onChange: (filters: FeedFilters) => void;
}) {
  useAppLanguage();
  const { t } = useTranslation();

  return (
    <View style={styles.strip}>
      {FILTER_KINDS.map((kind) => {
        const Icon = svg.marketFilterIcons[kind];
        const selected = isFilterSelected(filters, kind);
        const actions: AppMenuAction[] = filterChoices(filters, kind).map((choice) => ({
          id: choice.id,
          title: t(choice.titleKey),
          state: choice.selected ? 'on' : 'off',
        }));
        return (
          <AppMenuView
            key={kind}
            testID={`market-filter-${kind}`}
            actions={actions}
            onPressAction={({ nativeEvent }) => {
              onChange(applyFilterChoice(filters, kind, nativeEvent.event));
            }}
          >
            <View style={styles.chip}>
              <Icon width={16} height={16} style={selected ? undefined : styles.iconInactive} />
              <Text
                style={[styles.label, { color: selected ? colors.contentB : colors.contentM }]}
                numberOfLines={1}
              >
                {t(filterChipTitle(filters, kind))}
              </Text>
            </View>
          </AppMenuView>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 1 },
  /** `Capsule().fill(Neutral100)` + `White.opacity(0.92).padding(1)` → #FDFDFD with a 1pt rim. */
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.neutral100,
    backgroundColor: '#FDFDFD',
  },
  label: { ...beVietnamPro(15, 'medium') },
  iconInactive: { opacity: 0.55 },
});
