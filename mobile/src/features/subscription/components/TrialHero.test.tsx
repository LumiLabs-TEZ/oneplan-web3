import { fireEvent, render, screen } from '@testing-library/react-native';

import { initI18n, setAppLanguage } from '@/i18n';

import { TrialHero } from './TrialHero';

beforeAll(() => {
  initI18n();
});

afterEach(() => {
  setAppLanguage('en');
});

describe('TrialHero', () => {
  it('shows the "with" connector line in English', async () => {
    await render(<TrialHero onClose={jest.fn()} testID="trial-hero" />);
    expect(screen.getByText('with')).toBeTruthy();
  });

  it('hides the "with" connector line in Vietnamese', async () => {
    setAppLanguage('vi');
    await render(<TrialHero onClose={jest.fn()} testID="trial-hero" />);
    expect(screen.queryByText('with')).toBeNull();
  });

  it('calls onClose when the close button is pressed', async () => {
    const onClose = jest.fn();
    await render(<TrialHero onClose={onClose} testID="trial-hero" />);
    fireEvent.press(screen.getByTestId('trial-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
