import { render, screen } from '@testing-library/react-native';

import { MetricPill } from './MetricPill';

describe('MetricPill', () => {
  it('renders the value and title', async () => {
    await render(
      <MetricPill title="Trips" value={4} minimumIntegerDigits={2} testID="metric-trips" />,
    );
    expect(screen.getByText('04')).toBeTruthy();
    expect(screen.getByText('Trips')).toBeTruthy();
  });

  it('renders the count unpadded by default and clamps negatives', async () => {
    await render(
      <>
        <MetricPill title="Cities" value={123} />
        <MetricPill title="Trips" value={-5} minimumIntegerDigits={2} />
      </>,
    );
    expect(screen.getByText('123')).toBeTruthy();
    expect(screen.getByText('00')).toBeTruthy();
  });
});
