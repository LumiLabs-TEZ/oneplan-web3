/** @jest-environment node */
import { nextDelayMs } from './backoff';

const fixedRandom = () => 0.5; // jitter factor = 1

describe('nextDelayMs', () => {
  it('returns base*2000 capped at 30000 with no jitter when random=0.5', () => {
    expect(nextDelayMs(1, fixedRandom)).toBe(2000);
    expect(nextDelayMs(2, fixedRandom)).toBe(4000);
    expect(nextDelayMs(15, fixedRandom)).toBe(null);
    expect(nextDelayMs(10, fixedRandom)).toBe(20000);
  });

  it('caps the base delay at 30000ms', () => {
    expect(nextDelayMs(20, fixedRandom)).toBe(null);
    // attempt within range but large enough to exceed cap
    expect(nextDelayMs(9, fixedRandom)).toBe(18000);
  });

  it('returns null for attempt > 10', () => {
    expect(nextDelayMs(11, fixedRandom)).toBeNull();
    expect(nextDelayMs(100, fixedRandom)).toBeNull();
  });

  it('applies jitter bounds of +/-30%', () => {
    const min = nextDelayMs(5, () => 0); // factor 0.7
    const max = nextDelayMs(5, () => 1); // factor 1.3
    const base = 5 * 2000;
    expect(min).toBe(Math.round(base * 0.7));
    expect(max).toBe(Math.round(base * 1.3));
  });
});
