import { router } from 'expo-router';
import { ReceiptFlow } from '@/features/receipt/ReceiptFlow';
import { useRequirePro } from '@/features/subscription/useRequirePro';
import { useTripDetail } from '@/features/trip/TripDetailContext';

export default function ReceiptScanScreen() {
  const { tripId, trip, members } = useTripDetail();
  const { requirePro } = useRequirePro();
  return (
    <ReceiptFlow
      tripId={tripId}
      members={members}
      localCurrency={trip?.localCurrencies[0]}
      homeCurrency={trip?.currency}
      requirePro={requirePro}
      onDismiss={() => router.back()}
      onSaved={() =>
        router.dismissTo({ pathname: '/trip/[tripId]', params: { tripId: String(tripId) } })
      }
    />
  );
}
