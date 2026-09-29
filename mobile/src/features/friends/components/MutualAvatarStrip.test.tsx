import { render, screen } from '@testing-library/react-native';

import { MutualAvatarStrip } from './MutualAvatarStrip';

describe('MutualAvatarStrip', () => {
  it('renders three placeholder avatars (locked mock)', async () => {
    await render(<MutualAvatarStrip testID="strip" />);
    expect(screen.getByTestId('strip')).toBeTruthy();
    expect(screen.getAllByTestId('avatar-placeholder')).toHaveLength(3);
  });
});
