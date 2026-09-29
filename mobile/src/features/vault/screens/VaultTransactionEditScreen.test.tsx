import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { useUpdateVaultSpend } from '../api/mutations';
import { VaultTransactionEditScreen } from './VaultTransactionEditScreen';

jest.mock('../api/mutations');

const mockedUseUpdateVaultSpend = jest.mocked(useUpdateVaultSpend);

const members = [
  {
    id: 1,
    userId: 1,
    displayName: 'Nam',
    avatarUrl: null,
    inviteStatus: 'ACCEPTED' as const,
    role: 'MEMBER' as const,
    isPro: false,
  },
  {
    id: 2,
    userId: 2,
    displayName: 'An',
    avatarUrl: null,
    inviteStatus: 'PENDING' as const,
    role: 'MEMBER' as const,
    isPro: false,
  },
];

describe('VaultTransactionEditScreen', () => {
  beforeAll(() => {
    initI18n();
  });

  it('saves name/category/shareWithUserIds and NEVER includes an amount field', async () => {
    const mutateAsync = jest.fn(async () => ({ id: 42 }) as never);
    mockedUseUpdateVaultSpend.mockReturnValue({ mutateAsync, isPending: false } as never);
    const onSaved = jest.fn();

    const screen = await render(
      <VaultTransactionEditScreen
        tripId={5}
        vaultTransactionId={42}
        amountVnd={200_000}
        rate={26_500}
        members={members}
        initialName="Cafe"
        initialCategory="COFFEE"
        initialShareWithUserIds={[]}
        onBack={jest.fn()}
        onSaved={onSaved}
      />,
    );

    await fireEvent.press(screen.getByTestId('vault-edit-done'));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const body = (mutateAsync.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(body).not.toHaveProperty('amount');
    expect(body).not.toHaveProperty('amountVnd');
    expect(body).not.toHaveProperty('amountMicro');
    expect(body).toEqual({ name: 'Cafe', category: 'COFFEE', shareWithUserIds: [] });
    expect(onSaved).toHaveBeenCalledWith({ id: 42 }, 'Cafe');
  });

  it('falls back to the category title when the name is cleared to blank', async () => {
    const mutateAsync = jest.fn(async () => ({ id: 42 }) as never);
    mockedUseUpdateVaultSpend.mockReturnValue({ mutateAsync, isPending: false } as never);

    const screen = await render(
      <VaultTransactionEditScreen
        tripId={5}
        vaultTransactionId={42}
        amountVnd={200_000}
        members={members}
        initialName="Cafe"
        initialCategory="COFFEE"
        initialShareWithUserIds={[]}
        onBack={jest.fn()}
        onSaved={jest.fn()}
      />,
    );

    await fireEvent.changeText(screen.getByPlaceholderText('Transaction name'), '   ');
    await fireEvent.press(screen.getByTestId('vault-edit-done'));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      name: 'Coffee',
      category: 'COFFEE',
      shareWithUserIds: [],
    });
  });

  it('selecting a member switches off "shared with all" and sends only that id', async () => {
    const mutateAsync = jest.fn(async () => ({ id: 42 }) as never);
    mockedUseUpdateVaultSpend.mockReturnValue({ mutateAsync, isPending: false } as never);

    const screen = await render(
      <VaultTransactionEditScreen
        tripId={5}
        vaultTransactionId={42}
        amountVnd={200_000}
        members={members}
        initialName="Cafe"
        initialCategory="COFFEE"
        initialShareWithUserIds={[]}
        onBack={jest.fn()}
        onSaved={jest.fn()}
      />,
    );

    await fireEvent.press(screen.getByTestId('vault-edit-share-1'));
    await fireEvent.press(screen.getByTestId('vault-edit-done'));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      name: 'Cafe',
      category: 'COFFEE',
      shareWithUserIds: [1],
    });
  });
});
