import { render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { PaywallHeader } from './PaywallHeader';

beforeAll(() => {
  initI18n();
});

describe('PaywallHeader', () => {
  it('renders the "One Plan" wordmark and the Pro pill', async () => {
    const screen = await render(<PaywallHeader testID="paywall-header" />);
    expect(screen.getByTestId('paywall-header')).toBeTruthy();
    expect(screen.getByText('One Plan')).toBeTruthy();
    expect(screen.getByText('Pro')).toBeTruthy();
  });
});
