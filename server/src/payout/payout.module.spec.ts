import { assertMockPayoutSafe } from './payout.module';

const config = (values: Record<string, string>) => ({
  get: (key: string) => values[key],
});

describe('S11: mock payout provider vs production keys', () => {
  it('refuses to boot in production with a fee payer key set', () => {
    expect(() =>
      assertMockPayoutSafe(
        config({ NODE_ENV: 'production', SOLANA_FEE_PAYER_SECRET_KEY: 'k' }),
      ),
    ).toThrow(/MockPayoutProvider/);
  });

  it('refuses to boot in production with a receiver key set', () => {
    expect(() =>
      assertMockPayoutSafe(
        config({ NODE_ENV: 'production', SOLANA_RECEIVER_SECRET_KEY: 'k' }),
      ),
    ).toThrow(/MockPayoutProvider/);
  });

  it('boots in production while the keys are unset', () => {
    expect(() =>
      assertMockPayoutSafe(config({ NODE_ENV: 'production' })),
    ).not.toThrow();
  });

  it('boots outside production with keys set (dev / devnet)', () => {
    expect(() =>
      assertMockPayoutSafe(
        config({
          NODE_ENV: 'development',
          SOLANA_FEE_PAYER_SECRET_KEY: 'k',
          SOLANA_RECEIVER_SECRET_KEY: 'k',
        }),
      ),
    ).not.toThrow();
  });
});
