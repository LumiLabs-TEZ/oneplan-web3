/**
 * Route wrapper for `VaultPayFlow` — navigation only. Entry point: `TripVaultSection`'s scan
 * button (`TripVaultCard.onScanQR`). Presents like iOS's `.fullScreenCover`; the sheets it hosts
 * (`VaultExpenseSheet`) need their own portal host nested inside this modal, not the root's.
 */
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { router, useLocalSearchParams } from 'expo-router';

import { useTripDetail } from '@/features/trip/TripDetailContext';
import { VaultPayFlow } from '@/features/vault/screens/VaultPayFlow';

export default function VaultPayRoute() {
  const { tripId: raw } = useLocalSearchParams<{ tripId: string }>();
  const detail = useTripDetail();

  return (
    <BottomSheetModalProvider>
      <VaultPayFlow
        tripId={Number(raw)}
        members={detail.members}
        allowsEditing={detail.access.canEdit}
        onClose={() => router.back()}
      />
    </BottomSheetModalProvider>
  );
}
