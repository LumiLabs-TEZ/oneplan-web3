import type { components } from '@/api/schema';
import type { Document } from './state';
export function fromTrip(
  trip: components['schemas']['TripDto'],
  items: components['schemas']['PlanItemDto'][],
): Document {
  const firstDate =
    trip.startDate?.slice(0, 10) ??
    items
      .map((item) => item.planDate)
      .filter((date): date is string => !!date)
      .sort()[0];
  const dayFor = (item: components['schemas']['PlanItemDto']) =>
    item.dayNumber ??
    (item.planDate && firstDate
      ? Math.round((Date.parse(item.planDate.slice(0, 10)) - Date.parse(firstDate)) / 86400000) + 1
      : 1);
  const days = Math.max(1, ...items.map(dayFor));
  return {
    fields: {
      name: trip.name,
      countryId: trip.location?.countryId ?? 0,
      cityId: trip.location?.cityId ?? undefined,
      stateId: trip.location?.stateId ?? undefined,
      currency: trip.currency,
      price: 0,
      durationDays: days,
      tags: ['FRIENDS'],
    },
    coverUri: trip.coverImageUrl ?? undefined,
    importedImages: items.flatMap((item) => item.imageUrls),
    activities: items.map((item) => ({
      key: `trip-${item.id}`,
      dayNumber: dayFor(item),
      title: item.title,
      description: item.description ?? undefined,
      location: item.location ?? undefined,
      address: item.address ?? undefined,
      latitude: item.latitude ?? undefined,
      longitude: item.longitude ?? undefined,
      startTime: item.startTime ?? undefined,
      category: item.category ?? undefined,
      sortOrder: item.sortOrder,
      imageUrls: item.imageUrls,
    })),
  };
}
