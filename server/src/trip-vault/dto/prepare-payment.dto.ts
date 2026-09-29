import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseCategory, VaultTxSource } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class PreparePaymentDto {
  @ApiProperty({
    description: 'Raw EMVCo payload scanned from the VietQR code',
  })
  @IsString()
  @MaxLength(512)
  qrPayload: string;

  @ApiPropertyOptional({ description: 'Amount in VND as a decimal string' })
  @IsOptional()
  @Matches(/^\d+$/)
  @MaxLength(20)
  amountVnd?: string;

  @ApiProperty({ description: 'Expense name shown in the trip ledger' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ enum: ExpenseCategory, enumName: 'ExpenseCategory' })
  @IsEnum(ExpenseCategory)
  category: ExpenseCategory;

  // `type: 'integer', isArray: true` rather than `type: [Number]`: the latter
  // emits `number`, which swift-openapi-generator maps to Double, and user ids
  // are integers.
  // Empty means shared by everyone — same convention as settlement math,
  // vault history, and UpdateVaultSpendDto. The iOS "All" chip sends [].
  @ApiProperty({
    type: 'integer',
    isArray: true,
    description:
      'User ids the expense is split across. Empty array means shared by everyone.',
  })
  @IsArray()
  @IsInt({ each: true })
  shareWithUserIds: number[];

  // Who pays. Only the caller can sign for their own wallet, so the choice is
  // the group or the caller — never another member.
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

export class PreparePaymentResponseDto {
  @ApiProperty({
    description: 'Base64 legacy transaction for the client to sign',
  })
  base64Tx: string;

  @ApiProperty()
  vaultTransactionId: number;

  @ApiProperty({ description: 'True when a second member must approve' })
  needsApproval: boolean;

  @ApiProperty({ enum: VaultTxSource, enumName: 'VaultTxSource' })
  source: VaultTxSource;

  @ApiProperty({
    description:
      'Micro-USDC the transaction moves, as a decimal string. The client checks the instruction against it before signing.',
  })
  amountUsdcMicro: string;

  @ApiPropertyOptional({
    description:
      "PERSONAL only: the caller's USDC token account the transfer debits.",
  })
  payerAta?: string;
}

export class SubmitSignedDto {
  @ApiProperty({
    description: 'Base64 transaction with the client signature added',
  })
  @IsString()
  signedTx: string;
}

export class DepositRequestDto {
  @ApiProperty({ description: 'Amount in micro-USDC as a decimal string' })
  @Matches(/^\d+$/)
  @MaxLength(20)
  amountMicro: string;
}

export class UnsignedTxDto {
  @ApiProperty({
    description: 'Base64 legacy transaction for the client to sign',
  })
  base64Tx: string;
}

export class SubmitResultDto {
  @ApiProperty({ description: 'PENDING, CONFIRMED or FAILED' })
  status: string;
}

export class SubmitDepositDto {
  @ApiProperty({
    description: 'Base64 transaction with the client signature added',
  })
  @IsString()
  signedTx: string;

  // Ignored by the server: the credited amount is decoded from the signed
  // transaction (audit S1). Kept so existing clients keep validating.
  @ApiProperty({
    description:
      'Amount in micro-USDC as a decimal string (informational; the server credits what the signed transaction transfers)',
  })
  @Matches(/^\d+$/)
  @MaxLength(20)
  amountMicro: string;
}

export class DepositResultDto {
  @ApiProperty({ description: 'On-chain signature of the confirmed deposit' })
  signature: string;
}

export class SyncMembersResultDto {
  @ApiProperty({ description: 'How many members were added on chain' })
  added: number;
}
