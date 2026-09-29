import { render, screen } from '@testing-library/react-native';

import { CIRCULAR_TEXT_GLYPH_TEST_ID, CIRCULAR_TEXT_TEST_ID } from './CircularText';
import { RotatingAvatarBadge } from './RotatingAvatarBadge';

describe('RotatingAvatarBadge', () => {
  it('renders the ring caption and an avatar placeholder when there is no photo', async () => {
    await render(<RotatingAvatarBadge ringText="CATTIE OI - MEMBER SINCE 2025" testID="badge" />);
    expect(screen.getByTestId('badge')).toBeTruthy();
    expect(screen.getByTestId(CIRCULAR_TEXT_TEST_ID)).toBeTruthy();
    const glyphs = screen.getAllByTestId(CIRCULAR_TEXT_GLYPH_TEST_ID);
    expect(glyphs.map((g) => g.props.content as string).join('')).toBe(
      'CATTIE OI - MEMBER SINCE 2025',
    );
    expect(screen.getByTestId('avatar-placeholder')).toBeTruthy();
  });
});
