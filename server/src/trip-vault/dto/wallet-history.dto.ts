import { ApiProperty } from '@nestjs/swagger';

export class WalletHistoryEntryDto {
  @ApiProperty({ description: 'Solana transaction signature (unique id)' })
  id: string;

  @ApiProperty({ description: 'withdraw | deposit' })
  kind: string;

  @ApiProperty({
    description: 'Counterparty wallet address (owner, not ATA)',
  })
  address: string;

  @ApiProperty({
    description: 'Absolute amount in micro-USDC as a decimal string',
  })
  amountMicro: string;

  @ApiProperty({
    description:
      'Unix seconds when the transfer landed (string for iOS decode safety)',
  })
  blockTime: string;

  @ApiProperty({ description: 'ISO 8601 timestamp, or empty when unknown' })
  createdAt: string;
}
