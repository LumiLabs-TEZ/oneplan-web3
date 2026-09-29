import { fireEvent, render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { shortenVaultAddress, VaultDepositingSheet } from './VaultDepositingSheet';

describe('shortenVaultAddress', () => {
  it('truncates as 4 + 4 with an ellipsis', () => {
    expect(shortenVaultAddress('9RqQabcdefghijklmnopDzQi')).toBe('9RqQ...DzQi');
  });

  it('leaves a short address unchanged', () => {
    expect(shortenVaultAddress('short')).toBe('short');
  });
});

describe('VaultDepositingSheet', () => {
  beforeAll(() => {
    initI18n();
  });

  it('formats the amount and fires onDetails', async () => {
    const onDetails = jest.fn();
    const screen = await render(
      <VaultDepositingSheet
        amountMicro={5_000_000n}
        fromAddress="9RqQabcdefghijklmnopDzQi"
        toAddress="6yTjabcdefghijklmnopoeRkh"
        onDetails={onDetails}
      />,
    );

    expect(screen.getByText('$5')).toBeTruthy();
    expect(screen.getByText('9RqQ...DzQi')).toBeTruthy();
    expect(screen.getByText('6yTj...eRkh')).toBeTruthy();

    await fireEvent.press(screen.getByText('Details'));
    expect(onDetails).toHaveBeenCalledTimes(1);
  });

  it('formats a fractional amount with two decimals', async () => {
    const screen = await render(
      <VaultDepositingSheet
        amountMicro={5_500_000n}
        fromAddress="A"
        toAddress="B"
        onDetails={jest.fn()}
      />,
    );
    expect(screen.getByText('$5.5')).toBeTruthy();
  });
});
