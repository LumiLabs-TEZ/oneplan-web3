import { formatPlanTime, formatDuration, hhmm } from './timeLabel';

describe('formatDuration', () => {
  it('formats seconds under a minute', () => {
    expect(formatDuration(5)).toBe('0:05');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(125)).toBe('2:05');
  });

  it('zero-pads single-digit seconds', () => {
    expect(formatDuration(61)).toBe('1:01');
  });

  it('truncates fractional seconds', () => {
    expect(formatDuration(59.9)).toBe('0:59');
  });

  it('formats zero', () => {
    expect(formatDuration(0)).toBe('0:00');
  });
});

describe('hhmm', () => {
  it('zero-pads hour and minute', () => {
    expect(hhmm(9, 5)).toBe('09:05');
  });

  it('formats midnight', () => {
    expect(hhmm(0, 0)).toBe('00:00');
  });

  it('formats double-digit hour/minute unchanged', () => {
    expect(hhmm(23, 59)).toBe('23:59');
  });
});

describe('formatPlanTime', () => {
  it('follows the device clock: 12-hour → "8:00 AM", 24-hour → "08:00"', () => {
    expect(formatPlanTime(8, 0, 'en-US', false)).toMatch(/^8:00\sAM$/);
    expect(formatPlanTime(8, 0, 'en-US', true)).toBe('08:00');
    expect(formatPlanTime(20, 5, 'en-US', true)).toBe('20:05');
  });
});
