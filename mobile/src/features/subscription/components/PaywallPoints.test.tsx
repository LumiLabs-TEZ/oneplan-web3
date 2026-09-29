import { render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { PaywallPoints } from './PaywallPoints';

beforeAll(() => {
  initI18n();
});

describe('PaywallPoints', () => {
  it('renders all 5 points', async () => {
    const screen = await render(<PaywallPoints selectedSku="pro_yearly" testID="points" />);
    expect(screen.getByText('Request new plan')).toBeTruthy();
    expect(screen.getByText('Unlimited planning trips')).toBeTruthy();
    expect(screen.getByText('Split bill by AI')).toBeTruthy();
    expect(screen.getByText('Extract pins by video')).toBeTruthy();
    expect(screen.getByText('Trip insights')).toBeTruthy();
  });

  it('shows the scan quota for the selected sku only next to the video point', async () => {
    const screen = await render(<PaywallPoints selectedSku="pro_weekly" testID="points" />);
    expect(screen.getByText('3 scans / week')).toBeTruthy();
  });

  it('shows the yearly quota when a yearly sku is selected', async () => {
    const screen = await render(<PaywallPoints selectedSku="pro_yearly" testID="points" />);
    expect(screen.getByText('300 scans / year')).toBeTruthy();
  });

  it('defaults the quota label to the yearly plan when nothing is selected yet', async () => {
    // Matches `PaywallView.videoQuotaLabel(for:)`'s nil fallback.
    const screen = await render(<PaywallPoints selectedSku={null} testID="points" />);
    expect(screen.getByText('300 scans / year')).toBeTruthy();
  });
});
