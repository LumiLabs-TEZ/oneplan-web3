import { fireEvent, render, screen } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { RecordingCard } from './RecordingCard';

beforeAll(() => {
  initI18n();
});

describe('RecordingCard', () => {
  it('shows "0:07" for 7 recorded seconds', async () => {
    await render(
      <RecordingCard title="New Plan" recording seconds={7} bars={[]} onStop={jest.fn()} />,
    );
    expect(screen.getByText('0:07')).toBeTruthy();
  });

  it('shows "Say something" when not yet recording', async () => {
    await render(
      <RecordingCard title="New Plan" recording={false} seconds={0} bars={[]} onStop={jest.fn()} />,
    );
    expect(screen.getByText('Say something')).toBeTruthy();
  });

  it('renders the live waveform bars using the iOS `card` scale (`max(8, v*58)`)', async () => {
    await render(
      <RecordingCard title="New Plan" recording seconds={3} bars={[0.5, 1]} onStop={jest.fn()} />,
    );
    const waveform = screen.getByTestId('plan-recording-waveform');
    expect(waveform).toBeTruthy();
    const bars = waveform.props.children as { props: { style: unknown } }[];
    const heights = bars
      .slice(0, 2)
      .map((bar) => (bar.props.style as { height: number }[]).find((s) => 'height' in s)!.height);
    expect(heights).toEqual([29, 58]);
  });

  it('fires onStop when the stop button is pressed', async () => {
    const onStop = jest.fn();
    await render(
      <RecordingCard title="New Plan" recording seconds={3} bars={[]} onStop={onStop} />,
    );
    await fireEvent.press(screen.getByTestId('plan-record-stop'));
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
