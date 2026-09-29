import { render, screen } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { PassportSummarySection } from './PassportSummarySection';

beforeAll(() => {
  initI18n();
});

describe('PassportSummarySection', () => {
  it('pads the three metrics to two digits and renders six flags', async () => {
    await render(
      <PassportSummarySection
        tripCount={3}
        countryCount={12}
        cityCount={0}
        displayName="Bella Oi"
        memberSince="2025-03-09T00:00:00.000Z"
      />,
    );

    expect(screen.getByText('Trips')).toBeTruthy();
    expect(screen.getByText('03')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('00')).toBeTruthy();
    expect(screen.getByTestId('friend-flag-5')).toBeTruthy();
  });
});
