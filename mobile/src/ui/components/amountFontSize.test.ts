import { AMOUNT_FONT_STEPS, amountFontSize } from './amountFontSize';

/** A 360pt-wide phone minus the display's 24pt insets. */
const NARROW = 360 - 48;

describe('amountFontSize', () => {
  it('keeps the full 48pt size for everyday amounts', () => {
    expect(amountFontSize('0', NARROW)).toBe(48);
    expect(amountFontSize('1,234,567', NARROW)).toBe(48);
    expect(amountFontSize('12,345.67', NARROW)).toBe(48);
  });

  it('steps down monotonically as the amount grows', () => {
    let previous = 48;
    let text = '';
    for (const digit of '999999999999') {
      text = (text.replace(/,/g, '') + digit).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      const size = amountFontSize(text, NARROW);
      expect(AMOUNT_FONT_STEPS).toContain(size);
      expect(size).toBeLessThanOrEqual(previous);
      previous = size;
    }
    expect(amountFontSize('999,999,999,999', NARROW)).toBeLessThan(48);
  });

  it('fits the longest possible amount on a narrow phone', () => {
    const size = amountFontSize('999,999,999,999.99', NARROW);
    expect(size).toBe(28);
    expect((14 * 0.71 + 4 * 0.3) * size).toBeLessThanOrEqual(NARROW);
  });

  it('uses the room a wider phone has', () => {
    expect(amountFontSize('999,999,999', 440 - 48)).toBeGreaterThan(
      amountFontSize('999,999,999', NARROW),
    );
  });
});
