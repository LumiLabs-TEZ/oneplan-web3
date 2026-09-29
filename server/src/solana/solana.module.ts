import { Global, Module } from '@nestjs/common';
import { SolanaService } from './solana.service';
import { VaultSafetyService } from './vault-safety.service';

@Global()
@Module({
  providers: [SolanaService, VaultSafetyService],
  exports: [SolanaService, VaultSafetyService],
})
export class SolanaModule {}
