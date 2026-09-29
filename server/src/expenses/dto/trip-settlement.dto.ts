import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional } from 'class-validator';

export const SETTLEMENT_DIRECTIONS = ['receive', 'pay'] as const;
export type SettlementDirection = (typeof SETTLEMENT_DIRECTIONS)[number];

export class SettlementItemDto {
  @ApiProperty({ type: 'integer' })
  expenseId: number;

  @ApiProperty()
  expenseName: string;

  @ApiProperty({ type: 'number' })
  shareAmount: number;

  @ApiProperty()
  isSettled: boolean;

  @ApiProperty({ type: 'integer' })
  shareId: number;

  @ApiProperty({
    description:
      'True = the counterparty owes you for this share; false = you owe them (or the group wallet).',
  })
  owedToYou: boolean;
}

export class CounterpartySettlementDto {
  @ApiProperty({ type: 'integer' })
  counterpartyUserId: number;

  @ApiProperty()
  displayName: string;

  @ApiPropertyOptional()
  avatarUrl: string | null;

  @ApiProperty({
    description:
      'True for the synthetic shared-wallet "Group" row (counterpartyUserId is 0).',
  })
  isGroup: boolean;

  @ApiProperty({
    enum: SETTLEMENT_DIRECTIONS,
    description:
      "'receive' = the counterparty owes you (you paid); 'pay' = you owe the counterparty.",
  })
  direction: SettlementDirection;

  @ApiProperty({ type: 'number' })
  totalAmount: number;

  @ApiProperty()
  isSettled: boolean;

  @ApiProperty({ type: [SettlementItemDto] })
  items: SettlementItemDto[];
}

export class TripSettlementSummaryDto {
  @ApiProperty({ type: [CounterpartySettlementDto] })
  settlements: CounterpartySettlementDto[];
}

export class SettleCounterpartyDto {
  @ApiProperty({ type: 'integer' })
  @IsInt()
  counterpartyUserId: number;

  @ApiProperty({ enum: SETTLEMENT_DIRECTIONS })
  @IsIn(SETTLEMENT_DIRECTIONS)
  direction: SettlementDirection;

  @ApiPropertyOptional({
    type: 'boolean',
    description:
      'When true, settle the shared-wallet Group (my shares of group-paid expenses); counterpartyUserId is ignored.',
  })
  @IsOptional()
  @IsBoolean()
  isGroup?: boolean;
}
