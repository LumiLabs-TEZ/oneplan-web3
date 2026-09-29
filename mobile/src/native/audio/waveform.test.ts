import { MAX_RECORD_SECONDS, METER_HZ, WAVEFORM_BARS, normalizeDb, pushSample, staticBars } from './waveform';

describe('constants', () => {
  it('match the iOS reference (AudioRecordingManager.swift:87-100)', () => {
    expect(WAVEFORM_BARS).toBe(51);
    expect(MAX_RECORD_SECONDS).toBe(15);
    expect(METER_HZ).toBe(15);
  });
});

describe('normalizeDb', () => {
  it('maps -60 dBFS (silence) to 0', () => {
    expect(normalizeDb(-60)).toBe(0);
  });

  it('maps -30 dBFS (half range) to 0.5', () => {
    expect(normalizeDb(-30)).toBe(0.5);
  });

  it('maps 0 dBFS (peak) to 1', () => {
    expect(normalizeDb(0)).toBe(1);
  });

  it('clamps values below -60', () => {
    expect(normalizeDb(-160)).toBe(0);
  });

  it('clamps values above 0', () => {
    expect(normalizeDb(20)).toBe(1);
  });
});

describe('pushSample', () => {
  it('appends while under the max', () => {
    expect(pushSample([0.1, 0.2], 0.3, 5)).toEqual([0.1, 0.2, 0.3]);
  });

  it('drops the oldest entries once at 51', () => {
    const buf = Array.from({ length: 51 }, (_, i) => i);
    const next = pushSample(buf, 999);
    expect(next).toHaveLength(51);
    expect(next[0]).toBe(1);
    expect(next[50]).toBe(999);
  });

  it('never exceeds the max even from an already-oversized buffer', () => {
    const buf = Array.from({ length: 60 }, (_, i) => i);
    const next = pushSample(buf, 999, 51);
    expect(next).toHaveLength(51);
    expect(next[50]).toBe(999);
  });

  it('does not mutate the input array', () => {
    const buf = [1, 2, 3];
    pushSample(buf, 4, 5);
    expect(buf).toEqual([1, 2, 3]);
  });
});

describe('staticBars', () => {
  it('returns 51 bars by default, all within 0-1', () => {
    const bars = staticBars(42);
    expect(bars).toHaveLength(51);
    for (const bar of bars) {
      expect(bar).toBeGreaterThanOrEqual(0);
      expect(bar).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic for the same seed', () => {
    expect(staticBars(7)).toEqual(staticBars(7));
  });

  it('differs across seeds', () => {
    expect(staticBars(1)).not.toEqual(staticBars(2));
  });

  it('respects a custom count', () => {
    expect(staticBars(1, 10)).toHaveLength(10);
  });
});
