import { QueryClient } from '@tanstack/react-query';

import { createApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import { ApiMutationError } from '@/api/mutationError';

import { isVaultNotEmptyError, vaultBlocksDelete } from './deleteGuard';

function apiReturning(status: number, body: unknown) {
  return createApiClient(
    'http://test',
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
}

const balance = (balanceMicro: string) => ({
  vaultPda: 'p',
  usdcAta: 'a',
  treasuryAta: 't',
  balanceMicro,
  thresholdMicro: '0',
  dailyLimitMicro: '0',
});

describe('vaultBlocksDelete', () => {
  const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

  it('blocks while the vault holds any USDC', async () => {
    await expect(vaultBlocksDelete(client(), 7, apiReturning(200, balance('1')))).resolves.toBe(
      true,
    );
  });

  it('allows an empty vault', async () => {
    await expect(vaultBlocksDelete(client(), 7, apiReturning(200, balance('0')))).resolves.toBe(
      false,
    );
  });

  it('ignores a stale cached balance and reads fresh', async () => {
    const qc = client();
    qc.setQueryData(keys.vault.balance(7), balance('9000000'));
    await expect(vaultBlocksDelete(qc, 7, apiReturning(200, balance('0')))).resolves.toBe(false);
  });

  it('leaves the decision to the server when the read fails', async () => {
    await expect(vaultBlocksDelete(client(), 7, apiReturning(503, {}))).resolves.toBe(false);
  });
});

describe('isVaultNotEmptyError', () => {
  it('matches only a 400 vault_not_empty body', () => {
    expect(isVaultNotEmptyError(new ApiMutationError(400, { code: 'vault_not_empty' }))).toBe(true);
    expect(isVaultNotEmptyError(new ApiMutationError(400, { code: 'other' }))).toBe(false);
    expect(isVaultNotEmptyError(new ApiMutationError(503, { code: 'vault_not_empty' }))).toBe(
      false,
    );
    expect(isVaultNotEmptyError(new Error('vault_not_empty'))).toBe(false);
  });
});
