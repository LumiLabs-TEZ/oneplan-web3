import { ApiProperty } from '@nestjs/swagger';

export class FaucetClaimDto {
  @ApiProperty({ description: 'Devnet transaction signature' })
  signature: string;

  @ApiProperty({ description: 'Micro-USDC sent, decimal string' })
  amountMicro: string;
}
