import * as Joi from 'joi';
import { solanaConfigSchema } from './solana.config';

describe('solanaConfigSchema', () => {
  const valid = {
    SOLANA_RPC_URL: 'https://api.devnet.solana.com',
    SOLANA_USDC_MINT: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    SOLANA_COMMITMENT: 'confirmed',
    SOLANA_FEE_PAYER_SECRET_KEY: '',
    SOLANA_RECEIVER_SECRET_KEY: '',
    MOCK_PAYOUT_OUTCOME: 'success',
  };

  const validate = (overrides: Record<string, unknown> = {}) =>
    Joi.object(solanaConfigSchema).validate(
      { ...valid, ...overrides },
      { allowUnknown: true },
    );

  it('accepts the documented defaults', () => {
    expect(validate().error).toBeUndefined();
  });

  it('applies defaults when the vars are absent', () => {
    const result = Joi.object(solanaConfigSchema).validate(
      {},
      { allowUnknown: true },
    );
    const error = result.error;
    const value = result.value as Record<string, string>;
    expect(error).toBeUndefined();
    expect(value.SOLANA_COMMITMENT).toBe('confirmed');
    expect(value.MOCK_PAYOUT_OUTCOME).toBe('success');
  });

  it('rejects a non-https RPC url', () => {
    expect(validate({ SOLANA_RPC_URL: 'not-a-url' }).error).toBeDefined();
  });

  it('rejects an unknown mock outcome', () => {
    expect(validate({ MOCK_PAYOUT_OUTCOME: 'explode' }).error).toBeDefined();
  });

  it('allows an empty fee payer key so the server still boots', () => {
    expect(validate({ SOLANA_FEE_PAYER_SECRET_KEY: '' }).error).toBeUndefined();
  });

  it('defaults the kill switch to off', () => {
    const value = Joi.object(solanaConfigSchema).validate(
      {},
      { allowUnknown: true },
    ).value as Record<string, unknown>;
    expect(value.WEB3_ENABLED).toBe(false);
  });

  it('accepts WEB3_ENABLED=true from the environment', () => {
    const result = validate({ WEB3_ENABLED: 'true' });
    expect(result.error).toBeUndefined();
    expect((result.value as Record<string, unknown>).WEB3_ENABLED).toBe(true);
  });

  // S8: an emptied var used to fail Joi and stop the API booting.
  it.each(['SOLANA_RPC_URL', 'SOLANA_USDC_MINT', 'SOLANA_COMMITMENT'])(
    'tolerates an empty %s so the server still boots',
    (key) => {
      expect(validate({ [key]: '' }).error).toBeUndefined();
    },
  );

  it('no longer defines the unused SOLANA_PROGRAM_ID', () => {
    expect(Object.keys(solanaConfigSchema)).not.toContain('SOLANA_PROGRAM_ID');
    // ...and a stale value left in an env file is still accepted.
    expect(validate({ SOLANA_PROGRAM_ID: '' }).error).toBeUndefined();
  });
});
