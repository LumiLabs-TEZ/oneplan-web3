import type { PinInput } from '../types';
import type { CreatePlanItemDto } from '@/features/plan/types';
export function parseTimeOfDay(text?: string): string | undefined {
  if (!text) return;
  const lower = text.toLowerCase();
  const match = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (match) {
    const hour = Number(match[1]),
      minute = Number(match[2] ?? 0);
    if (hour < 1 || hour > 12 || minute > 59) return;
    return `${String((hour % 12) + (match[3] === 'pm' ? 12 : 0)).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
  const keywords: [string, string][] = [
    ['sunrise', '06:00'],
    ['breakfast', '08:00'],
    ['morning', '09:00'],
    ['noon', '12:00'],
    ['lunch', '12:00'],
    ['afternoon', '14:00'],
    ['sunset', '17:30'],
    ['evening', '18:00'],
    ['dinner', '19:00'],
    ['night', '20:00'],
  ];
  return keywords.find(([word]) => lower.includes(word))?.[1];
}
export function pinPlanItems(pins: PinInput[], userId: number): CreatePlanItemDto[] {
  const offsets = new Map<number, number>();
  return pins.map((pin) => {
    const dayNumber = pin.dayNumber ?? 1;
    const offset = offsets.get(dayNumber) ?? 0;
    offsets.set(dayNumber, offset + 1);
    const minutes = Math.min(540 + offset * 30, 1410);
    return {
      title: pin.name,
      dayNumber,
      startTime:
        parseTimeOfDay(pin.timeOfDayText) ??
        `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
      description: pin.notes,
      location: pin.address,
      address: pin.address,
      latitude: pin.latitude,
      longitude: pin.longitude,
      userIds: [userId],
    };
  });
}
export const suggestedDays = (count: number) => Math.max(1, Math.min(14, Math.ceil(count / 4)));
export function pinsFarApart(pins: PinInput[]): boolean {
  const located = pins.filter((p) => p.latitude !== undefined && p.longitude !== undefined);
  const rad = (n: number) => (n * Math.PI) / 180;
  return located.some((a, i) =>
    located.slice(i + 1).some((b) => {
      const d =
        Math.sin(rad(b.latitude! - a.latitude!) / 2) ** 2 +
        Math.cos(rad(a.latitude!)) *
          Math.cos(rad(b.latitude!)) *
          Math.sin(rad(b.longitude! - a.longitude!) / 2) ** 2;
      return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, d))) > 1500;
    }),
  );
}
