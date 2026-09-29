/**
 * Location search modal — port of `TripLocationPickerSheet.swift`. Presented full-screen from
 * `trip/new/index.tsx`; picking a row writes into `createTripStore` and pops back.
 */
import { router } from 'expo-router';

import { LocationPickerScreen } from '@/features/location/components/LocationPickerScreen';
import { createTripStore } from '@/features/trip/createTripStore';

export default function LocationSearchScreen() {
  return (
    <LocationPickerScreen
      onClose={() => router.back()}
      onSelect={(result) => {
        createTripStore.setLocation(result);
        router.back();
      }}
    />
  );
}
