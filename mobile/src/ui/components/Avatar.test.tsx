import { render } from '@testing-library/react-native';

import { Avatar } from './Avatar';

describe('Avatar', () => {
  it('renders the Pro badge only when isPro is true', async () => {
    const withoutPro = await render(<Avatar uri={null} size={40} testID="avatar" />);
    expect(withoutPro.queryByTestId('avatar-pro-badge')).toBeNull();

    const withPro = await render(<Avatar uri={null} size={40} isPro testID="avatar" />);
    expect(withPro.getByTestId('avatar-pro-badge')).toBeTruthy();
  });

  it('merges a caller-supplied style (e.g. a ring border) onto the same clipped/radius frame node', async () => {
    const screen = await render(
      <Avatar
        uri={null}
        size={40}
        testID="avatar"
        style={{ borderWidth: 4, borderColor: 'red' }}
      />,
    );
    const frame = screen.getByTestId('avatar');
    expect(frame).toHaveStyle({ borderWidth: 4, borderColor: 'red', borderRadius: 20 });
  });
});
