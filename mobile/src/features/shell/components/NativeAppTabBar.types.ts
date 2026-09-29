import type { StyleProp, ViewStyle } from 'react-native';

export interface NativeAppTabBarProps {
  tabs: { key: string; title: string; icon: string; selectedIcon: string }[];
  actions: { id: string; title: string; symbol: string; pro: boolean }[];
  selectedIndex: number;
  expanded: boolean;
  bottomPadding: number;
  /** Defaults to `true`; `false` drops the FAB and shrinks the bar to a centred pill. */
  showsFab?: boolean;
  onSelectTab: (event: { nativeEvent: { index: number } }) => void;
  /** Optional for bars without the FAB (`showsFab={false}`), where they never fire. */
  onToggleExpanded?: (event: { nativeEvent: { expanded: boolean } }) => void;
  onAction?: (event: { nativeEvent: { id: string } }) => void;
  style?: StyleProp<ViewStyle>;
}
