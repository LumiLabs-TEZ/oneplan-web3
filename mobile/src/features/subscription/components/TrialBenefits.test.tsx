import { render, screen } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { TrialBenefits } from './TrialBenefits';

beforeAll(() => {
  initI18n();
});

describe('TrialBenefits', () => {
  it('renders every benefit row, including the video-pins detail', async () => {
    await render(<TrialBenefits testID="trial-benefits" />);

    expect(screen.getByText('Upload plans on market')).toBeTruthy();
    expect(screen.getByText('Unlimited planning trips')).toBeTruthy();
    expect(screen.getByText('Split bill by AI')).toBeTruthy();
    expect(screen.getByText('Extract pins by video')).toBeTruthy();
    expect(screen.getByText('10 videos/week')).toBeTruthy();
    expect(screen.getByText('Trip insights')).toBeTruthy();
  });
});
