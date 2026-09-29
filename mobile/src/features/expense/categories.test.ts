import { EXPENSE_CATEGORIES, categoryOption } from './categories';

describe('expense categories', () => {
  it('has the 14 server enum values, OTHER last', () => {
    expect(EXPENSE_CATEGORIES).toHaveLength(14);
    expect(new Set(EXPENSE_CATEGORIES.map((c) => c.value)).size).toBe(14);
    expect(EXPENSE_CATEGORIES[13]?.value).toBe('OTHER');
    expect(EXPENSE_CATEGORIES[0]).toMatchObject({ value: 'FOOD', title: 'Restaurant' });
  });

  it('falls back to OTHER for unknown values', () => {
    expect(categoryOption('PHARMACY').title).toBe('Pharmacy');
    expect(categoryOption('bogus').value).toBe('OTHER');
    expect(categoryOption(undefined).value).toBe('OTHER');
  });
});
