import { render } from '@testing-library/react-native';

import { barWidth } from '@/features/passport/helpers/distribution';

import { PassportDistributionSection } from './PassportDistributionSection';

const ROWS = [
  { label: 'Da Lat', count: 10 },
  { label: 'Vung Tau', count: 5 },
  { label: 'Ha Noi', count: 1 },
];

describe('PassportDistributionSection', () => {
  it('renders the title, total, suffix and one row per entry', async () => {
    const screen = await render(
      <PassportDistributionSection
        title="Top Cities"
        total={4}
        totalSuffix="cities"
        rows={ROWS}
        testID="passport-dist-cities"
      />,
    );

    expect(screen.getByText('Top Cities')).toBeTruthy();
    expect(screen.getByText('04')).toBeTruthy();
    expect(screen.getByText('cities')).toBeTruthy();
    expect(screen.getByText('Da Lat')).toBeTruthy();
    expect(screen.getByText('Vung Tau')).toBeTruthy();
    expect(screen.getByText('Ha Noi')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('exposes a stable testID per row track so onLayout-driven sizing can be measured', async () => {
    const screen = await render(
      <PassportDistributionSection title="Top Cities" total={4} totalSuffix="cities" rows={ROWS} />,
    );

    const track = screen.getByTestId('passport-distribution-track-Da Lat');
    expect(track).toBeTruthy();
  });

  it('sizes each bar with the shared barWidth() helper — before layout, `available` is 0', async () => {
    const screen = await render(
      <PassportDistributionSection title="Top Cities" total={4} totalSuffix="cities" rows={ROWS} />,
    );

    // maxCount = 10 (Da Lat). Before any `onLayout` callback fires, `available` defaults to 0, so
    // every row falls back to barWidth's floor (12.624) — asserts the component wires `barWidth`
    // rather than hand-rolling the ratio math.
    const track = screen.getByTestId('passport-distribution-track-Vung Tau');
    const bar = track.children[0] as unknown as { props: { style: [unknown, { width: number }] } };
    expect(bar.props.style[1].width).toBe(barWidth(5, 10, 0));
  });

  it('renders the header total/suffix even with an empty rows list', async () => {
    const screen = await render(
      <PassportDistributionSection title="Top Cities" total={0} totalSuffix="cities" rows={[]} />,
    );

    expect(screen.getByText('Top Cities')).toBeTruthy();
    expect(screen.getByText('00')).toBeTruthy();
  });
});
