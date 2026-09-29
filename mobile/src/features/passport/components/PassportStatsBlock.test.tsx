import { act, render } from '@testing-library/react-native';

import { countryBadges } from '@/features/passport/helpers/flags';
import type { PassportSummaryDto } from '@/features/passport/types';
import { initI18n } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';

import { PassportStatsBlock } from './PassportStatsBlock';

const SUMMARY: PassportSummaryDto = {
  displayName: 'Danny Dinh',
  email: 'danny@example.com',
  memberSince: '2025-01-01T00:00:00.000Z',
  tripsCount: 7,
  countriesCount: 3,
  citiesCount: 4,
  topCities: [],
  topCountries: [{ name: 'Vietnam', emoji: '🇻🇳', count: 5 }],
};

describe('PassportStatsBlock', () => {
  beforeAll(() => {
    initI18n();
  });

  afterEach(async () => {
    await act(async () => {
      useSettingsStore.setState({ language: 'en' });
    });
  });

  it('renders real summary values', async () => {
    const screen = await render(
      <PassportStatsBlock summary={SUMMARY} countryBadges={countryBadges(SUMMARY.topCountries)} />,
    );
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('03')).toBeTruthy();
    expect(screen.getByText('01 Jan 25')).toBeTruthy();
  });

  it('renders placeholder values when summary is null', async () => {
    const screen = await render(
      <PassportStatsBlock summary={null} countryBadges={countryBadges(null)} />,
    );
    expect(screen.getByText('24')).toBeTruthy();
    expect(screen.getByText('03')).toBeTruthy();
    expect(screen.getByText('12 Mar 26')).toBeTruthy();
  });

  it('hides the member-since/country-visited row when topRowOnly is set', async () => {
    const screen = await render(
      <PassportStatsBlock summary={null} countryBadges={countryBadges(null)} topRowOnly />,
    );
    expect(screen.queryByText('Member since')).toBeNull();
    expect(screen.queryByText('12 Mar 26')).toBeNull();
    expect(screen.getByText('24')).toBeTruthy();
  });

  it('renders one badge per country badge entry', async () => {
    const badges = countryBadges(SUMMARY.topCountries);
    const screen = await render(<PassportStatsBlock summary={SUMMARY} countryBadges={badges} />);
    expect(screen.getByText('🇻🇳')).toBeTruthy();
  });

  it('formats "Member since" in the active app language, not hardcoded en-US', async () => {
    const enScreen = await render(
      <PassportStatsBlock summary={SUMMARY} countryBadges={countryBadges(SUMMARY.topCountries)} />,
    );
    const enValue = enScreen.getByText('01 Jan 25');
    expect(enValue).toBeTruthy();

    await act(async () => {
      useSettingsStore.setState({ language: 'vi' });
    });

    const viScreen = await render(
      <PassportStatsBlock summary={SUMMARY} countryBadges={countryBadges(SUMMARY.topCountries)} />,
    );
    // Don't hardcode the exact Vietnamese month token (depends on the jest environment's ICU
    // data) — just assert the vi-VN formatting differs from the en-US one.
    const viMonthPart = new Intl.DateTimeFormat('vi-VN', { month: 'short' }).format(
      new Date(SUMMARY.memberSince),
    );
    const enMonthPart = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(
      new Date(SUMMARY.memberSince),
    );
    expect(viMonthPart).not.toBe(enMonthPart);
    expect(viScreen.queryByText('01 Jan 25')).toBeNull();
  });
});
