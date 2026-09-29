import { enrichPin } from './enrichPin';
import { placeSearchProvider } from '@/native/maps/placeSearch';
jest.mock('@/native/maps/placeSearch', () => ({
  placeSearchProvider: () => ({ search: mockSearch }),
}));
const mockSearch = jest.fn();
it('only fills missing coordinates for matching names and regions', async () => {
  const pin = { index: 0, name: 'Café', city: 'Da Nang', country: 'Vietnam' };
  mockSearch.mockResolvedValue([
    { name: 'Cafe', address: 'Da Nang, Vietnam', latitude: 16, longitude: 108 },
  ]);
  expect(await enrichPin(pin, new AbortController().signal)).toMatchObject({
    latitude: 16,
    longitude: 108,
  });
  mockSearch.mockResolvedValue([
    { name: 'Cafe', address: 'Tokyo, Japan', latitude: 35, longitude: 139 },
  ]);
  expect(await enrichPin(pin, new AbortController().signal)).toBe(pin);
  const located = { ...pin, latitude: 1, longitude: 2 };
  expect(await enrichPin(located, new AbortController().signal)).toBe(located);
  expect(placeSearchProvider).toBeDefined();
});
