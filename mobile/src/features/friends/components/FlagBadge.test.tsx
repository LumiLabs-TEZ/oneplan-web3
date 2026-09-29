import { render, screen } from '@testing-library/react-native';

import { FIXED_FLAG_BADGES, FlagBadge } from './FlagBadge';

describe('FlagBadge', () => {
  it('renders the emoji flag', async () => {
    await render(<FlagBadge flag="🇻🇳" color="#DE2110" testID="flag" />);
    expect(screen.getByTestId('flag')).toBeTruthy();
    expect(screen.getByText('🇻🇳')).toBeTruthy();
  });

  it('locks the six mock countries in order', () => {
    expect(FIXED_FLAG_BADGES.map((b) => b.flag)).toEqual(['🇻🇳', '🇵🇭', '🇵🇪', '🇦🇷', '🇧🇷', '🇳🇬']);
  });
});
