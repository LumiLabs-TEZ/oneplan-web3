import { CATEGORY_CHIPS, categoryChip } from './categoryChip';
import { EXPENSE_CATEGORIES } from './categories';

describe('categoryChip', () => {
  it('covers every expense category with a title and an icon', () => {
    for (const { value } of EXPENSE_CATEGORIES) {
      const chip = categoryChip(value);
      expect(chip.title).toBeTruthy();
      expect(chip.icon).toBeTruthy();
    }
  });

  it('uses the short iOS chip titles', () => {
    expect(categoryChip('FOOD').title).toBe('Food');
    expect(categoryChip('STAY').title).toBe('Stay');
    expect(categoryChip('NIGHT_CLUB').title).toBe('Night club');
  });

  it('falls back to Other for unknown or missing values', () => {
    expect(categoryChip('NOPE')).toBe(CATEGORY_CHIPS.OTHER);
    expect(categoryChip(null)).toBe(CATEGORY_CHIPS.OTHER);
  });
});
