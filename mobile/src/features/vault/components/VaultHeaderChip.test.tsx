import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { VaultHeaderChip } from './VaultHeaderChip';

describe('VaultHeaderChip', () => {
  it('renders its children', async () => {
    const screen = await render(
      <VaultHeaderChip>
        <Text>Back</Text>
      </VaultHeaderChip>,
    );
    expect(screen.getByText('Back')).toBeTruthy();
  });

  it('renders over a camera backdrop without throwing', async () => {
    const screen = await render(
      <VaultHeaderChip overCamera cornerRadius={18}>
        <Text>Scan</Text>
      </VaultHeaderChip>,
    );
    expect(screen.getByText('Scan')).toBeTruthy();
  });
});
