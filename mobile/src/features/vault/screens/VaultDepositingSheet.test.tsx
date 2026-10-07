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
        status="processing"
        onDetails={onDetails}
        onDone={jest.fn()}
      />,
    );

    expect(screen.getByText('$5')).toBeTruthy();
    expect(screen.getByTestId('vault-depositing-loading')).toBeTruthy();
    expect(screen.getByText(/Please wait a few seconds/)).toBeTruthy();
    expect(screen.queryByText('Done')).toBeNull();
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
        status="processing"
        onDetails={jest.fn()}
        onDone={jest.fn()}
      />,
    );
    expect(screen.getByText('$5.5')).toBeTruthy();
  });

  it('shows the success state with Done and Details once completed', async () => {
    const onDone = jest.fn();
    const onDetails = jest.fn();
    const screen = await render(
      <VaultDepositingSheet
        amountMicro={500_000n}
        fromAddress="A"
        toAddress="B"
        status="completed"
        onDetails={onDetails}
        onDone={onDone}
      />,
    );

    expect(screen.getByTestId('vault-depositing-success')).toBeTruthy();
    expect(screen.getByText('Deposit complete')).toBeTruthy();
    expect(screen.queryByText(/Please wait/)).toBeNull();

    await fireEvent.press(screen.getByText('Done'));
    expect(onDone).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('Details'));
    expect(onDetails).toHaveBeenCalledTimes(1);
  });
});
