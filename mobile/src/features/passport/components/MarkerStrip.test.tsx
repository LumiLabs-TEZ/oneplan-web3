import { fireEvent, render } from '@testing-library/react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { MARKER_COLORS, MarkerStrip } from './MarkerStrip';

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return { __esModule: true, ...actual, useReducedMotion: jest.fn(() => false) };
});

const mockUseReducedMotion = useReducedMotion as jest.Mock;

describe('MarkerStrip', () => {
  afterEach(() => {
    mockUseReducedMotion.mockReturnValue(false);
  });

  it('renders one marker row for the static variant', async () => {
    const screen = await render(<MarkerStrip variant="static" testID="strip" />);
    const row = screen.getByTestId('strip-row');
    expect(row.props.children).toHaveLength(MARKER_COLORS.length);
    expect(screen.queryByTestId('strip-row-2')).toBeNull();
  });

  it('renders two marker rows for the animated variant (looping copies)', async () => {
    const screen = await render(<MarkerStrip variant="animated" testID="strip" />);
    const row1 = screen.getByTestId('strip-row');
    const row2 = screen.getByTestId('strip-row-2');
    expect(row1.props.children).toHaveLength(MARKER_COLORS.length);
    expect(row2.props.children).toHaveLength(MARKER_COLORS.length);
  });

  it('renders enough copies to cover the measured width plus one cycle', async () => {
    const screen = await render(<MarkerStrip variant="animated" testID="strip" />);
    fireEvent(screen.getByTestId('strip'), 'layout', {
      nativeEvent: { layout: { width: 700, height: 16, x: 0, y: 0 } },
    });
    // cycle = 16*13 + 15*6 + 6 = 304 → ceil(700/304) + 1 = 4 copies.
    expect(await screen.findByTestId('strip-row-4')).toBeTruthy();
    expect(screen.queryByTestId('strip-row-5')).toBeNull();
  });

  it('defaults to the animated variant', async () => {
    const screen = await render(<MarkerStrip testID="strip" />);
    expect(screen.getByTestId('strip-row-2')).toBeTruthy();
  });

  it('suppresses the loop and keeps the offset at 0 when reduce-motion is on', async () => {
    mockUseReducedMotion.mockReturnValue(true);
    const screen = await render(<MarkerStrip variant="animated" testID="strip" />);
    const loopRow = screen.getByTestId('strip-row').parent;
    // `withRepeat`/`withTiming` never run, so the loop stays pinned at its initial offset — no
    // translateX transform is scheduled beyond the identity 0 the effect sets synchronously.
    const style = Object.assign({}, ...[loopRow?.props.style].flat());
    expect(style.transform).toEqual([{ translateX: 0 }]);
  });
});
