import type { components } from '@/api/schema';
import { fromTrip } from './fromTrip';
it('preserves relative day gaps and copies source images for listing-owned uploads', () => {
  const trip = {
    name: 'Trip',
    startDate: '2026-09-01',
    currency: 'VND',
    location: { countryId: 1 },
  } as components['schemas']['TripDto'];
  const items = [
    {
      id: 5,
      title: 'Arrival',
      planDate: '2026-09-01',
      sortOrder: 0,
      imageUrls: ['https://trip/photo'],
    },
    { id: 6, title: 'Visit', planDate: '2026-09-03', sortOrder: 2, imageUrls: [] },
  ] as components['schemas']['PlanItemDto'][];
  const doc = fromTrip(trip, items);
  expect(doc.fields.durationDays).toBe(3);
  expect(doc.activities.map((a) => a.dayNumber)).toEqual([1, 3]);
  expect(doc.activities[0]?.id).toBeUndefined();
  expect(doc.importedImages).toEqual(['https://trip/photo']);
});
