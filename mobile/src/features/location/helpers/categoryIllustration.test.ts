import { svg } from '@/ui/assets';

import { categoryIllustration, categoryIllustrationKey } from './categoryIllustration';

describe('categoryIllustrationKey', () => {
  it('returns an exact ExpenseCategory enum value directly, bypassing keyword matching', () => {
    expect(categoryIllustrationKey('STAY')).toBe('STAY');
    expect(categoryIllustrationKey('PARK')).toBe('PARK');
  });

  it('still keyword-matches free-text POI names', () => {
    expect(categoryIllustrationKey('restaurant')).toBe('FOOD');
  });
});

describe('categoryIllustration', () => {
  it('falls back to the default (OTHER) illustration for null, empty, or unmatched categories', () => {
    expect(categoryIllustration(null)).toBe(svg.categories.OTHER);
    expect(categoryIllustration('')).toBe(svg.categories.OTHER);
    expect(categoryIllustration('   ')).toBe(svg.categories.OTHER);
    expect(categoryIllustration('Laundromat')).toBe(svg.categories.OTHER);
  });

  it('matches coffee categories', () => {
    expect(categoryIllustration('Coffee Shop')).toBe(svg.categories.COFFEE);
    expect(categoryIllustration('Café')).toBe(svg.categories.COFFEE);
  });

  it('matches hotel/lodging categories', () => {
    expect(categoryIllustration('Hotel')).toBe(svg.categories.STAY);
    expect(categoryIllustration('Beach Resort')).toBe(svg.categories.STAY);
  });

  it('matches food categories', () => {
    expect(categoryIllustration('Italian Restaurant')).toBe(svg.categories.FOOD);
    expect(categoryIllustration('Pizza Place')).toBe(svg.categories.FOOD);
  });

  it('matches attraction categories', () => {
    expect(categoryIllustration('History Museum')).toBe(svg.categories.TICKET);
    expect(categoryIllustration('Amusement Park')).toBe(svg.categories.TICKET);
  });

  it('matches park categories (its own bucket, distinct from attractions)', () => {
    expect(categoryIllustration('National Park')).toBe(svg.categories.PARK);
    expect(categoryIllustration('Botanical Garden')).toBe(svg.categories.PARK);
  });

  it('is case-insensitive', () => {
    expect(categoryIllustration('COFFEE SHOP')).toBe(svg.categories.COFFEE);
  });
});
