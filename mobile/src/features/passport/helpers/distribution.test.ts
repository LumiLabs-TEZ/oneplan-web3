import { barWidth, pad2, PLACEHOLDER_SUMMARY } from './distribution';

describe('barWidth', () => {
  it('is proportional to count/maxCount * available', () => {
    expect(barWidth(5, 10, 200)).toBe(100);
  });

  it('is the full available width when count === maxCount', () => {
    expect(barWidth(10, 10, 200)).toBe(200);
  });

  it('floors at 12.624 for a very small count', () => {
    expect(barWidth(1, 1000, 200)).toBe(12.624);
  });

  it('floors at 12.624 for a zero count', () => {
    expect(barWidth(0, 10, 200)).toBe(12.624);
  });

  it('treats a zero maxCount as 1 to avoid division by zero', () => {
    expect(barWidth(0, 0, 200)).toBe(12.624);
  });
});

describe('pad2', () => {
  it('pads single digits with a leading zero', () => {
    expect(pad2(3)).toBe('03');
  });

  it('leaves two-digit numbers unpadded', () => {
    expect(pad2(24)).toBe('24');
  });

  it('clamps negative numbers to 0', () => {
    expect(pad2(-5)).toBe('00');
  });

  it('passes through larger numbers unpadded', () => {
    expect(pad2(123)).toBe('123');
  });
});

describe('PLACEHOLDER_SUMMARY', () => {
  it('has the iOS placeholder city rows', () => {
    expect(PLACEHOLDER_SUMMARY.cities).toEqual([
      { label: 'Da Lat', count: 10 },
      { label: 'Vung Tau', count: 5 },
      { label: 'Ha Noi', count: 1 },
      { label: 'Bankok', count: 1 },
    ]);
  });

  it('has the iOS placeholder country rows', () => {
    expect(PLACEHOLDER_SUMMARY.countries).toEqual([
      { label: 'Viet Nam', count: 4 },
      { label: 'Thailand', count: 2 },
      { label: 'UAE', count: 1 },
    ]);
  });
});
