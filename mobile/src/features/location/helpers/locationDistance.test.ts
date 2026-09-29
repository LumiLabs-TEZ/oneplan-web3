import { formatLocationDistance } from './locationDistance';

describe('formatLocationDistance', () => {
  it('rounds sub-kilometre distances to 50 m', () => {
    expect(formatLocationDistance(0, 'en')).toBe('0m');
    expect(formatLocationDistance(374, 'en')).toBe('350m');
    expect(formatLocationDistance(376, 'en')).toBe('400m');
  });

  it('shows one decimal under 10 km', () => {
    expect(formatLocationDistance(4_330, 'en')).toBe('4.3km');
    expect(formatLocationDistance(4_330, 'vi')).toBe('4,3km');
  });

  it('shows whole grouped km from 10 km up', () => {
    expect(formatLocationDistance(4_330_000, 'en')).toBe('4,330km');
    expect(formatLocationDistance(4_330_000, 'vi')).toBe('4.330km');
  });
});
