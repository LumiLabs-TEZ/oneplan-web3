import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches, MaxLength } from 'class-validator';

export class CreateVaultDto {
  // Defaults chosen for a devnet trip: a member can spend up to 3 USDC alone,
  // and the group cannot move more than 100 USDC in a day however many
  // approvals it collects. Both are in micro-USDC.
  @ApiPropertyOptional({
    description: 'Spend above this needs a second approval, in micro-USDC',
    default: '3000000',
  })
  @IsOptional()
  @Matches(/^\d+$/)
  @MaxLength(20)
  thresholdMicro?: string;

  @ApiPropertyOptional({
    description: 'Hard ceiling on spending per rolling day, in micro-USDC',
    default: '100000000',
  })
  @IsOptional()
  @Matches(/^\d+$/)
  @MaxLength(20)
  dailyLimitMicro?: string;
}

export class VaultCreatedDto {
  @ApiProperty({ description: 'On-chain address of the trip vault' })
  vaultPda: string;

  @ApiProperty({ description: 'Token account the vault holds USDC in' })
  usdcAta: string;

  @ApiProperty({ description: 'Members added to the vault on chain' })
  membersSynced: number;
}
