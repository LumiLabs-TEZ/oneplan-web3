import { render, screen } from '@testing-library/react-native';

import { WaveformBars } from './WaveformBars';

describe('WaveformBars', () => {
  it('renders exactly `count` bars', async () => {
    await render(<WaveformBars values={[1, 0.5]} count={5} testID="bars" />);
    expect(screen.getByTestId('bars').props.children).toHaveLength(5);
  });

  it('"compact" variant (default) scales bar height as `4 + v*20`, clamped to 0-1', async () => {
    await render(<WaveformBars values={[1, 0, 0.5, 2, -1]} count={5} testID="bars" />);
    const bars = screen.getByTestId('bars').props.children as { props: { style: unknown } }[];
    const heights = bars.map(
      (bar) => (bar.props.style as { height: number }[]).find((s) => 'height' in s)!.height,
    );
    expect(heights).toEqual([24, 4, 14, 24, 4]);
  });

  it('"card" variant scales bar height as the iOS `max(8, v*58)` formula, clamped to 0-1', async () => {
    await render(
      <WaveformBars values={[1, 0, 0.5, 2, -1]} count={5} variant="card" testID="bars" />,
    );
    const bars = screen.getByTestId('bars').props.children as { props: { style: unknown } }[];
    const heights = bars.map(
      (bar) => (bar.props.style as { height: number }[]).find((s) => 'height' in s)!.height,
    );
    expect(heights).toEqual([58, 8, 29, 58, 8]);
  });

  it('treats missing values (fewer than `count`) as flat', async () => {
    await render(<WaveformBars values={[1]} count={3} testID="bars" />);
    const bars = screen.getByTestId('bars').props.children as { props: { style: unknown } }[];
    const heights = bars.map(
      (bar) => (bar.props.style as { height: number }[]).find((s) => 'height' in s)!.height,
    );
    expect(heights).toEqual([24, 4, 4]);
  });

  it('spaces "card" bars 4pt apart like iOS, "compact" 1pt', async () => {
    await render(<WaveformBars values={[]} count={3} variant="card" testID="card" />);
    expect(screen.getByTestId('card')).toHaveStyle({ gap: 4 });
    await render(<WaveformBars values={[]} count={3} testID="compact" />);
    expect(screen.getByTestId('compact')).toHaveStyle({ gap: 1 });
  });
});
