import { render, screen } from '@testing-library/react-native';

import { CIRCULAR_TEXT_GLYPH_TEST_ID, CIRCULAR_TEXT_TEST_ID, CircularText } from './CircularText';

describe('CircularText', () => {
  it('renders the caption uppercased on the ring', async () => {
    await render(<CircularText text="bella oi - member since 2025" size={213} radius={95} />);
    // react-native-svg lowers each glyph into a `content` prop rather than a text child.
    expect(screen.getByTestId(CIRCULAR_TEXT_TEST_ID)).toBeTruthy();
    const glyphs = screen.getAllByTestId(CIRCULAR_TEXT_GLYPH_TEST_ID);
    expect(glyphs.map((g) => g.props.content as string).join('')).toBe(
      'BELLA OI - MEMBER SINCE 2025',
    );
  });

  it('exposes its testID', async () => {
    await render(<CircularText text="x" size={100} radius={40} testID="ring" />);
    expect(screen.getByTestId('ring')).toBeTruthy();
  });
});
