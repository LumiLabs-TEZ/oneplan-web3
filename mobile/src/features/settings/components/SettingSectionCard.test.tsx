import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { SettingSectionCard } from './SettingSectionCard';

describe('SettingSectionCard', () => {
  it('renders the header title and every child row', async () => {
    const screen = await render(
      <SettingSectionCard icon="person-circle-outline" title="Personal" testID="section">
        <Text testID="row-1">Row 1</Text>
        <Text testID="row-2">Row 2</Text>
      </SettingSectionCard>,
    );
    expect(screen.getByText('Personal')).toBeTruthy();
    expect(screen.getByTestId('row-1')).toBeTruthy();
    expect(screen.getByTestId('row-2')).toBeTruthy();
  });
});
