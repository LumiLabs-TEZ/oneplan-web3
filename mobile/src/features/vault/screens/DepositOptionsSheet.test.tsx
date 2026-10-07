import { fireEvent, render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { DepositOptionsSheet } from './DepositOptionsSheet';

describe('DepositOptionsSheet', () => {
  beforeAll(() => {
    initI18n();
  });

  it('fires onOnchain when the OnePlan Wallet row is tapped', async () => {
    const onOnchain = jest.fn();
    const screen = await render(<DepositOptionsSheet onOnchain={onOnchain} />);

    await fireEvent.press(screen.getByText('OnePlan Wallet'));
    expect(onOnchain).toHaveBeenCalledTimes(1);
  });

  it('renders the Fiat row disabled — no handler exists anywhere on the branch', async () => {
    const screen = await render(<DepositOptionsSheet onOnchain={jest.fn()} />);
    const fiatText = screen.getByText('Fiat');
    // Walk up to the Pressable ancestor to check its disabled accessibility state.
    let node = fiatText.parent;
    while (node && node.props.accessibilityState === undefined) node = node.parent;
    expect(node?.props.accessibilityState?.disabled).toBe(true);
  });

  it('labels only the Fiat row "Coming soon"', async () => {
    const screen = await render(<DepositOptionsSheet onOnchain={jest.fn()} />);
    expect(screen.getAllByText('Coming soon')).toHaveLength(1);
  });
});
