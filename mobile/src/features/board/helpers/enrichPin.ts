import { placeSearchProvider } from '@/native/maps/placeSearch';
import type { ExtractedPin } from '../types';
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
/** Conservative fallback: never replace model text with a result from an unconfirmed region. */
export async function enrichPin(pin: ExtractedPin, signal: AbortSignal): Promise<ExtractedPin> {
  if (pin.latitude !== undefined && pin.longitude !== undefined) return pin;
  if (!pin.city && !pin.country) return pin;
  const results = await placeSearchProvider().search(
    [pin.name, pin.city, pin.country].filter(Boolean).join(', '),
    null,
    signal,
  );
  const match = results.find((place) => {
    const address = normalize(place.address ?? '');
    return (
      normalize(place.name) === normalize(pin.name) &&
      [pin.city, pin.country].filter(Boolean).every((part) => address.includes(normalize(part!)))
    );
  });
  return match
    ? {
        ...pin,
        latitude: match.latitude,
        longitude: match.longitude,
        address: match.address ?? pin.address,
      }
    : pin;
}
