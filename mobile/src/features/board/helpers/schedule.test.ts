import { parseTimeOfDay, pinPlanItems, suggestedDays, pinsFarApart } from './schedule';
it.each([
  ['12am', '00:00'],
  ['12pm', '12:00'],
  ['5:30 pm', '17:30'],
  ['sunset', '17:30'],
  ['13pm', undefined],
  ['9:99am', undefined],
])('parses %s', (input, result) => expect(parseTimeOfDay(input)).toBe(result));
it('staggering resets per day and preserves explicit schedule', () => {
  expect(
    pinPlanItems(
      [
        { name: 'A' },
        { name: 'B', dayNumber: 2 },
        { name: 'C', timeOfDayText: 'lunch' },
        { name: 'D' },
      ],
      7,
    ).map((p) => [p.dayNumber, p.startTime, p.userIds]),
  ).toEqual([
    [1, '09:00', [7]],
    [2, '09:00', [7]],
    [1, '12:00', [7]],
    [1, '10:00', [7]],
  ]);
});
it('clamps generation duration and ignores missing coordinates in distance warning', () => {
  expect([0, 1, 5, 80].map(suggestedDays)).toEqual([1, 1, 2, 14]);
  expect(pinsFarApart([{ name: 'a' }, { name: 'b' }])).toBe(false);
  expect(
    pinsFarApart([
      { name: 'a', latitude: 0, longitude: 0 },
      { name: 'b', latitude: 40, longitude: 100 },
    ]),
  ).toBe(true);
});
