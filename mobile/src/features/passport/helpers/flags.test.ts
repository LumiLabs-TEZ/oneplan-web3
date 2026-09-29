import { countryBadges, FLAG_BADGE_PALETTE } from './flags';

describe('countryBadges', () => {
  it('maps each country to its emoji + cycling palette background', () => {
    const badges = countryBadges([{ emoji: '🇯🇵' }, { emoji: '🇰🇷' }]);
    expect(badges).toEqual([
      { flag: '🇯🇵', background: FLAG_BADGE_PALETTE[0] },
      { flag: '🇰🇷', background: FLAG_BADGE_PALETTE[1] },
    ]);
  });

  it('falls back to the globe emoji when a country has no flag', () => {
    expect(countryBadges([{ emoji: null }])).toEqual([
      { flag: '🌐', background: FLAG_BADGE_PALETTE[0] },
    ]);
  });

  it('caps at max (default 6)', () => {
    const countries = Array.from({ length: 10 }, (_, i) => ({ emoji: `flag${i}` }));
    expect(countryBadges(countries)).toHaveLength(6);
  });

  it('respects a custom max', () => {
    const countries = Array.from({ length: 10 }, (_, i) => ({ emoji: `flag${i}` }));
    expect(countryBadges(countries, 3)).toHaveLength(3);
  });

  it('cycles the palette once the country list exceeds the palette length', () => {
    const countries = Array.from({ length: 6 }, (_, i) => ({ emoji: `flag${i}` }));
    const badges = countryBadges(countries, 6);
    expect(badges[5]?.background).toBe(FLAG_BADGE_PALETTE[5 % FLAG_BADGE_PALETTE.length]);
  });

  it('returns the iOS placeholder flags when topCountries is null', () => {
    const badges = countryBadges(null);
    expect(badges.map((b) => b.flag)).toEqual(['🇻🇳', '🇪🇹', '🇵🇪', '🇦🇷', '🇧🇷', '🇳🇬']);
  });

  it('returns the iOS placeholder flags when topCountries is undefined', () => {
    const badges = countryBadges(undefined);
    expect(badges).toHaveLength(6);
  });

  it('returns an empty array for an empty real list', () => {
    expect(countryBadges([])).toEqual([]);
  });
});
