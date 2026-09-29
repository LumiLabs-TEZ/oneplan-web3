import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VaultTxSource } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class PayQuoteRequestDto {
  @ApiProperty({
    description: 'Raw EMVCo payload scanned from the VietQR code',
  })
  @IsString()
  @MaxLength(512)
  qrPayload: string;

  @ApiPropertyOptional({
    description:
      'Amount in VND as a decimal string. Required when the QR carries no amount',
  })
  @IsOptional()
  @Matches(/^\d+$/)
  amountVnd?: string;

  @ApiPropertyOptional({
    enum: VaultTxSource,
    enumName: 'VaultTxSource',
    description:
      'VAULT (default): the group wallet pays and the approval threshold applies. ' +
      "PERSONAL: the caller's own USDC wallet pays; no approval, no fee.",
  })
  @IsOptional()
  @IsEnum(VaultTxSource)
  source?: VaultTxSource;
}

export class PayQuoteDto {
  @ApiProperty({
    description: 'Account holder name reported by the payout provider',
  })
  recipientName: string;

  @ApiProperty({ description: 'NAPAS bank BIN' })
  bankBin: string;

  @ApiProperty()
  accountNumber: string;

  @ApiProperty({ description: 'Amount in VND as a decimal string' })
  amountVnd: string;

  @ApiProperty({ description: 'Amount in micro-USDC as a decimal string' })
  amountUsdcMicro: string;

  @ApiProperty({
    description: 'Provider fee in micro-USDC as a decimal string',
  })
  feeMicro: string;

  @ApiProperty({ description: 'VND per USDC' })
  rate: string;

  @ApiProperty({ description: 'True when a second member must approve' })
  needsApproval: boolean;

  @ApiProperty({ enum: VaultTxSource, enumName: 'VaultTxSource' })
  source: VaultTxSource;
}
