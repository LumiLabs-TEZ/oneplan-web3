import { fireEvent, render } from '@testing-library/react-native';

import type { PassportSummaryDto } from '@/features/passport/types';
import { initI18n } from '@/i18n';

import { PassportCard } from './PassportCard';

const SUMMARY: PassportSummaryDto = {
  displayName: 'Nguyễn Văn A',
  email: 'a@example.com',
  memberSince: '2024-05-01T00:00:00.000Z',
  tripsCount: 12,
  countriesCount: 3,
  citiesCount: 5,
  topCities: [],
  topCountries: [{ name: 'Vietnam', emoji: '🇻🇳', count: 5 }],
};

describe('PassportCard', () => {
  beforeAll(() => {
    initI18n();
  });

  it('full variant renders year chips, stats, and the share row', async () => {
    const onSelectYear = jest.fn();
    const onShare = jest.fn();
    const screen = await render(
      <PassportCard
        summary={SUMMARY}
        variant="full"
        years={[2026, 2025]}
        selectedYear={null}
        onSelectYear={onSelectYear}
        onShare={onShare}
        testID="card"
      />,
    );
    expect(screen.getByText('All time')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('IG Stories')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('card-years-2025'));
    expect(onSelectYear).toHaveBeenCalledWith(2025);

    await fireEvent.press(screen.getByTestId('card-share-photos'));
    expect(onShare).toHaveBeenCalledWith('photos');
  });

  it('compact variant renders MRZ + top-row stats only, no chips or share row', async () => {
    const screen = await render(<PassportCard summary={SUMMARY} variant="compact" testID="card" />);
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.queryByText('All time')).toBeNull();
    expect(screen.queryByText('IG Stories')).toBeNull();
    expect(screen.queryByText('Member since')).toBeNull();
  });

  it('render variant renders stats + MRZ but no chips or share row', async () => {
    const screen = await render(<PassportCard summary={SUMMARY} variant="render" testID="card" />);
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('Member since')).toBeTruthy();
    expect(screen.queryByText('All time')).toBeNull();
    expect(screen.queryByText('IG Stories')).toBeNull();
  });

  it('falls back to placeholder stats when summary is null', async () => {
    const screen = await render(<PassportCard summary={null} variant="compact" testID="card" />);
    expect(screen.getByText('24')).toBeTruthy();
  });
});
