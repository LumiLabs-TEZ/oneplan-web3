import { isoWeekKey, monthKey, quarterKey } from './period-key.util';

describe('period-key.util (Asia/Ho_Chi_Minh)', () => {
  it('computes a plain mid-week key', () => {
    // Wed 2026-08-12 in both UTC and HCM.
    expect(isoWeekKey(new Date('2026-08-12T04:00:00Z'))).toBe('2026-W33');
  });

  it('rolls to the next week at HCM midnight Monday, not UTC', () => {
    // Sun 2026-08-09 17:30 UTC = Mon 2026-08-10 00:30 HCM → new week.
    expect(isoWeekKey(new Date('2026-08-09T17:30:00Z'))).toBe('2026-W33');
    // Sun 2026-08-09 16:00 UTC = Sun 23:00 HCM → still the old week.
    expect(isoWeekKey(new Date('2026-08-09T16:00:00Z'))).toBe('2026-W32');
  });

  it('assigns early January to the previous ISO year when applicable', () => {
    // Fri 2027-01-01 00:00 HCM sits in the week whose Thursday is
    // Dec 31 2026 → ISO year 2026, week 53.
    expect(isoWeekKey(new Date('2026-12-31T17:00:00Z'))).toBe('2026-W53');
  });

  it('pads single-digit weeks', () => {
    // Thu 2026-01-01 HCM → W01.
    expect(isoWeekKey(new Date('2026-01-01T04:00:00Z'))).toBe('2026-W01');
  });

  it('computes month keys in HCM time', () => {
    expect(monthKey(new Date('2026-08-12T04:00:00Z'))).toBe('2026-08');
    // 2026-07-31 18:00 UTC = 2026-08-01 01:00 HCM.
    expect(monthKey(new Date('2026-07-31T18:00:00Z'))).toBe('2026-08');
  });

  it('computes quarter keys in HCM time', () => {
    expect(quarterKey(new Date('2026-08-12T04:00:00Z'))).toBe('2026-Q3');
    // 2026-09-30 18:00 UTC = 2026-10-01 01:00 HCM → Q4.
    expect(quarterKey(new Date('2026-09-30T18:00:00Z'))).toBe('2026-Q4');
    expect(quarterKey(new Date('2026-01-15T04:00:00Z'))).toBe('2026-Q1');
  });
});
