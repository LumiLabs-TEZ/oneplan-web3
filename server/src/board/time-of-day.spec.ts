import { parseTimeOfDay } from './time-of-day';

describe('parseTimeOfDay', () => {
  it.each([
    ['9am', '09:00'],
    ['9 AM', '09:00'],
    ['5:30pm', '17:30'],
    ['5.30 pm', '17:30'],
    ['12pm', '12:00'],
    ['12am', '00:00'],
    ['17h', '17:00'],
    ['17h30', '17:30'],
    ['09:00', '09:00'],
    ['8h sáng', '08:00'],
    ['3h chiều', '15:00'],
    ['7 giờ tối', '19:00'],
    ['sáng', '08:00'],
    ['buổi sáng', '08:00'],
    ['morning', '08:00'],
    ['breakfast', '08:00'],
    ['trưa', '12:00'],
    ['lunch', '12:00'],
    ['after lunch', '13:30'],
    ['chiều', '15:00'],
    ['afternoon', '15:00'],
    ['tối', '18:30'],
    ['dinner', '18:30'],
    ['evening', '18:30'],
    ['đêm', '20:30'],
    ['night', '20:30'],
  ])('%s → %s', (input, expected) => {
    expect(parseTimeOfDay(input)).toBe(expected);
  });

  it.each(['', '   ', null, undefined, 'sometime', '5', '99:00'])(
    'returns undefined for %p',
    (input) => {
      expect(parseTimeOfDay(input)).toBeUndefined();
    },
  );
});
