import { render, screen } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { TrialCountdown } from './TrialCountdown';

beforeAll(() => {
  initI18n();
});

describe('TrialCountdown', () => {
  it('renders the hrs/min/sec cells with the given remaining time', async () => {
    await render(
      <TrialCountdown remaining={{ hrs: 1, min: 2, sec: 3 }} testID="trial-countdown" />,
    );

    expect(screen.getByTestId('trial-countdown-hrs')).toHaveTextContent('1hrs');
    expect(screen.getByTestId('trial-countdown-min')).toHaveTextContent('2min');
    expect(screen.getByTestId('trial-countdown-sec')).toHaveTextContent('3sec');
    expect(screen.getByText('No Payment today')).toBeTruthy();
  });

  it('renders zeroed cells once the countdown reaches zero', async () => {
    await render(
      <TrialCountdown remaining={{ hrs: 0, min: 0, sec: 0 }} testID="trial-countdown" />,
    );

    expect(screen.getByTestId('trial-countdown-hrs')).toHaveTextContent('0hrs');
    expect(screen.getByTestId('trial-countdown-min')).toHaveTextContent('0min');
    expect(screen.getByTestId('trial-countdown-sec')).toHaveTextContent('0sec');
  });
});
