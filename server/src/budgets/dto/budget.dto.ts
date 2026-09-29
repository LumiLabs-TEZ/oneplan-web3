import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency, ExpenseCategory, PlanScope } from '@prisma/client';
import { BudgetPaymentDto } from './budget-payment.dto';

export class BudgetDto {
  @ApiProperty({ type: 'integer' })
  id: number;

  @ApiProperty({ type: 'integer' })
  tripId: number;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: 'number' })
  amount: number;

  @ApiPropertyOptional({ type: 'number' })
  perPersonAmount: number | null;

  @ApiProperty({ enum: PlanScope, enumName: 'PlanScope' })
  scope: PlanScope;

  @ApiPropertyOptional({ enum: ExpenseCategory, enumName: 'ExpenseCategory' })
  category?: ExpenseCategory;

  @ApiProperty()
  createdAt: string;

  @ApiProperty({ type: [BudgetPaymentDto] })
  payments: BudgetPaymentDto[];

  @ApiPropertyOptional({
    type: 'number',
    description: 'Amount in the original currency the user typed.',
  })
  originalAmount?: number;

  @ApiPropertyOptional({ enum: Currency, enumName: 'Currency' })
  originalCurrency?: Currency;

  @ApiPropertyOptional({
    type: 'number',
    description:
      'Exchange rate used to convert originalAmount → amount (in trip currency).',
  })
  exchangeRate?: number;

  @ApiPropertyOptional({
    type: 'boolean',
    description:
      'Present (and true) only on the immediate response of a create/update that used a stale/fallback exchange rate. Never present on reads.',
  })
  rateStale?: boolean;
}
