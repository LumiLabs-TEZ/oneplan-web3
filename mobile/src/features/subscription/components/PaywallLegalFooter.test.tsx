import { fireEvent, render } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { initI18n } from '@/i18n';

import { PaywallLegalFooter } from './PaywallLegalFooter';

beforeAll(() => {
  initI18n();
});

describe('PaywallLegalFooter', () => {
  it('renders the promo sentence and the three legal links', async () => {
    const screen = await render(<PaywallLegalFooter />);
    expect(screen.getByText('Terms of Service')).toBeTruthy();
    expect(screen.getByText('Privacy Policy')).toBeTruthy();
    expect(screen.getByText('Terms of Use (EULA)')).toBeTruthy();
  });

  it('opens the Terms of Service URL', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const screen = await render(<PaywallLegalFooter />);
    fireEvent.press(screen.getByTestId('paywall-terms'));
    expect(openURL).toHaveBeenCalledWith('https://oneplan.space/termandconditions');
  });

  it('opens the Privacy Policy URL', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const screen = await render(<PaywallLegalFooter />);
    fireEvent.press(screen.getByTestId('paywall-privacy'));
    expect(openURL).toHaveBeenCalledWith('https://oneplan.space/privacy-policy');
  });

  it('opens the EULA URL', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const screen = await render(<PaywallLegalFooter />);
    fireEvent.press(screen.getByTestId('paywall-eula'));
    expect(openURL).toHaveBeenCalledWith(
      'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/',
    );
  });
});
