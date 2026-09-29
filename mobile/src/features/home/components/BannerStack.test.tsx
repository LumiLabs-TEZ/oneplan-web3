import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { BannerStack } from './BannerStack';

async function renderStack(count: number) {
  await render(
    <BannerStack count={count} testID="stack">
      <Text>front</Text>
    </BannerStack>,
  );
}

describe('BannerStack', () => {
  it('a single item renders just the front card — no depth, no badge', async () => {
    await renderStack(1);

    expect(screen.getByText('front')).toBeTruthy();
    expect(screen.queryAllByTestId('stack-depth')).toHaveLength(0);
    expect(screen.queryByTestId('stack-badge')).toBeNull();
  });

  it('two items show one depth card and a +1 badge', async () => {
    await renderStack(2);

    expect(screen.getAllByTestId('stack-depth')).toHaveLength(1);
    expect(screen.getByTestId('stack-badge')).toHaveTextContent('+1');
  });

  it('caps the depth at two cards while the badge counts every waiting item', async () => {
    await renderStack(5);

    expect(screen.getAllByTestId('stack-depth')).toHaveLength(2);
    expect(screen.getByTestId('stack-badge')).toHaveTextContent('+4');
  });
});
