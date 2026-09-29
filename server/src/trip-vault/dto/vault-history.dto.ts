import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseCategory } from '@prisma/client';

export class VaultHistoryMemberDto {
  @ApiProperty({ type: 'integer' })
  userId: number;

  @ApiProperty()
  displayName: string;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl: string | null;
}

export class VaultHistoryEntryDto {
  @ApiProperty({ type: 'integer' })
  id: number;

  @ApiProperty({ description: 'DEPOSIT, SPEND, REVERT or SETTLEMENT' })
  kind: string;

  @ApiProperty({ description: 'PENDING, CONFIRMED or FAILED' })
  status: string;

  @ApiProperty({
    description:
      'True while the payment is above the trip limit and no second member has ' +
      'approved it. The money is still in the vault.',
  })
  needsApproval: boolean;

  @ApiPropertyOptional({
    nullable: true,
    type: () => VaultHistoryMemberDto,
    description:
      'The member a settlement paid. Null for anything else: only a ' +
      'settlement moves money back to a person.',
  })
  recipient: VaultHistoryMemberDto | null;

  @ApiProperty({ description: 'Amount in micro-USDC as a decimal string' })
  amountMicro: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Amount in VND as a decimal string, for payments',
  })
  amountVnd: string | null;

  @ApiPropertyOptional({ nullable: true })
  title: string | null;

  @ApiPropertyOptional({
    enum: ExpenseCategory,
    enumName: 'ExpenseCategory',
    nullable: true,
  })
  category: ExpenseCategory | null;

  @ApiPropertyOptional({
    type: VaultHistoryMemberDto,
    nullable: true,
    description: 'Who paid, when a single member did rather than the group',
  })
  paidBy: VaultHistoryMemberDto | null;

  @ApiProperty({
    type: VaultHistoryMemberDto,
    isArray: true,
    description: 'Empty means the expense is shared by everyone',
  })
  shareWith: VaultHistoryMemberDto[];

  @ApiPropertyOptional({
    nullable: true,
    description: 'Depositing wallet address, for deposits',
  })
  fromAddress: string | null;

  @ApiPropertyOptional({ nullable: true })
  signature: string | null;

  @ApiProperty({ description: 'ISO 8601 timestamp' })
  createdAt: string;
}

export class VaultTransactionDetailDto {
  @ApiProperty({ type: 'integer' })
  id: number;

  @ApiProperty({ description: 'PENDING, CONFIRMED or FAILED' })
  status: string;

  @ApiProperty({
    description:
      'True while the payment is above the trip limit and no second member has ' +
      'approved it. The money is still in the vault.',
  })
  needsApproval: boolean;

  @ApiProperty({
    description:
      'True when this caller may add the second signature: the payment is ' +
      'waiting, they did not raise it, and the trip lets them approve.',
  })
  canApprove: boolean;

  @ApiProperty({
    description:
      'True when this caller may cancel the open proposal: they raised it, or ' +
      'they are a trip host / co-host.',
  })
  canCancel: boolean;

  @ApiProperty({
    description:
      'True when this caller may edit name / category / share: confirmed spend, ' +
      'vault still open, trip not ended, and they are the payer or a host.',
  })
  canEdit: boolean;

  @ApiProperty({ description: 'Amount in VND as a decimal string' })
  amountVnd: string;

  @ApiProperty({ description: 'Amount in micro-USDC as a decimal string' })
  amountUsdcMicro: string;

  @ApiProperty()
  recipientName: string;

  @ApiProperty()
  bankName: string;

  @ApiProperty()
  bankAccountNumber: string;

  @ApiProperty({ description: 'Fee in micro-USDC as a decimal string' })
  feeMicro: string;

  @ApiProperty({
    description: 'VND per USDC at the time the payment was priced',
  })
  rate: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Expense / TX display name recorded with the spend',
  })
  name: string | null;

  @ApiPropertyOptional({ nullable: true })
  note: string | null;

  @ApiPropertyOptional({
    enum: ExpenseCategory,
    enumName: 'ExpenseCategory',
    nullable: true,
  })
  category: ExpenseCategory | null;

  @ApiPropertyOptional({ type: VaultHistoryMemberDto, nullable: true })
  paidBy: VaultHistoryMemberDto | null;

  @ApiProperty({ type: VaultHistoryMemberDto, isArray: true })
  shareWith: VaultHistoryMemberDto[];

  @ApiPropertyOptional({ type: VaultHistoryMemberDto, nullable: true })
  madeBy: VaultHistoryMemberDto | null;

  @ApiPropertyOptional({ nullable: true })
  signature: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'The scanned code, so the payment can be repeated',
  })
  qrPayload: string | null;

  @ApiProperty({ description: 'ISO 8601 timestamp' })
  createdAt: string;
}
