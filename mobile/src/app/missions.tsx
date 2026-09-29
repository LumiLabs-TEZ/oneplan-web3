import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';

import MissionsScreen from '@/features/missions/MissionsScreen';

/**
 * The route is a native `transparentModal`, so it sits above the root layout's sheet host. Its
 * sheets need a host inside this screen, or they render beneath the (touch-eating) modal.
 */
export default function MissionsRoute() {
  return (
    <BottomSheetModalProvider>
      <MissionsScreen />
    </BottomSheetModalProvider>
  );
}
