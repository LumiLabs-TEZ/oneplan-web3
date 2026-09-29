/**
 * Font size for the amount-keypad display. The animated number can't shrink itself the way
 * `<Text adjustsFontSizeToFit>` did, so the size steps down with the amount's length instead.
 */

/** Sizes the display steps through as the amount grows, largest (the design's 48pt) first. */
export const AMOUNT_FONT_STEPS = [48, 40, 34, 28] as const;
const SMALLEST_STEP = 28;

/**
 * Worst-case advance widths in Be Vietnam Pro Regular, in em: the widest digit is "4"
 * (0.71em; "1" is 0.39em) and "," / "." are ~0.3em. Sizing against the widest digit keeps any
 * amount inside the row whatever digits were typed.
 */
const EM_PER_DIGIT = 0.71;
const EM_PER_SEPARATOR = 0.3;

/**
 * Largest step at which the display `text` fits `width`. The longest possible amount — the
 * 12-digit cap plus 2 decimals, "999,999,999,999.99" (~11.1em) — still fits a 360pt-wide phone
 * (312pt after the 24pt insets) at the smallest step.
 */
export function amountFontSize(text: string, width: number): number {
  const digits = text.replace(/[^0-9]/g, '').length;
  const em = digits * EM_PER_DIGIT + (text.length - digits) * EM_PER_SEPARATOR;
  return AMOUNT_FONT_STEPS.find((size) => em * size <= width) ?? SMALLEST_STEP;
}
