import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MockPayoutProvider } from './mock-payout.provider';
import { PAYOUT_PROVIDER } from './payout-provider.interface';

/**
 * Refuses to boot in production while the mock is the only provider and a
 * Solana key is set: users would pay real USDC to the receiver wallet and get
 * no fiat in return (audit S-6). Swap in a real provider or unset the keys.
 */
export function assertMockPayoutSafe(config: {
  get: (key: string) => string | undefined;
}): void {
  const production = config.get('NODE_ENV') === 'production';
  const keysSet =
    !!config.get('SOLANA_FEE_PAYER_SECRET_KEY') ||
    !!config.get('SOLANA_RECEIVER_SECRET_KEY');
  if (production && keysSet) {
    throw new Error(
      'MockPayoutProvider is bound but SOLANA_FEE_PAYER_SECRET_KEY / SOLANA_RECEIVER_SECRET_KEY are set in production: unset them or bind a real payout provider',
    );
  }
}

/**
 * Phase 1 binds the mock. Phase 2 swaps the binding for FinFanPayoutProvider;
 * nothing that injects PAYOUT_PROVIDER changes.
 */
@Module({
  providers: [
    MockPayoutProvider,
    {
      provide: PAYOUT_PROVIDER,
      useFactory: (mock: MockPayoutProvider, config: ConfigService) => {
        assertMockPayoutSafe(config);
        return mock;
      },
      inject: [MockPayoutProvider, ConfigService],
    },
  ],
  exports: [PAYOUT_PROVIDER],
})
export class PayoutModule {}
