/**
 * Shared content insets for the four tab scenes. The `AppHeader` floats over the scene
 * (`headerTransparent`) and the `AppTabBar` is absolutely positioned, so every tab pads its
 * scroll content by the same amounts to clear both.
 */
import { useAppHeaderHeight } from '@/features/shell/components/AppHeader';
import { appTabBarHeight } from '@/features/shell/components/AppTabBar';
import { spacing } from '@/ui/theme';

export function useTabContentInsets() {
  const headerHeight = useAppHeaderHeight();
  const tabBarHeight = appTabBarHeight();
  return {
    /** `contentContainerStyle` (or root style for non-scrolling states). */
    contentStyle: {
      paddingTop: headerHeight + spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingBottom: tabBarHeight + spacing.lg,
    },
  };
}
