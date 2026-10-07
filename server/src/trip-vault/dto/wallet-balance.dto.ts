import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WalletBalanceDto {
  @ApiPropertyOptional({
    nullable: true,
    description: 'The caller wallet address, or null before one is linked',
  })
  publicKey: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Caller USDC ATA in base58, or null before a wallet is linked',
  })
  usdcAta: string | null;

  @ApiProperty({ description: 'USDC held by the caller, in micro-USDC' })
  balanceMicro: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Primary .skr name without the suffix (mainnet); null unless the wallet was linked with a SIWS proof',
  })
  skrDomain: string | null;

  @ApiProperty({
    description:
      'The linked key holds a Seeker Genesis Token (mainnet); false unless linked with a SIWS proof',
  })
  isSeeker: boolean;
}
