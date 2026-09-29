import { render, screen } from '@testing-library/react-native';

import { ProBadge } from './ProBadge';

describe('ProBadge', () => {
  it('renders the Pro label', async () => {
    await render(<ProBadge testID="pro-badge" />);
    expect(screen.getByTestId('pro-badge')).toHaveTextContent('Pro');
  });
});
