import { ApiPropertyOptional } from '@nestjs/swagger';
import { Currency, ExpenseCategory } from '@prisma/client';
import {
  IsArray,
  IsDefined,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ArrayNotEmpty,
  ValidateIf,
} from 'class-validator';

export class UpdateBudgetDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    type: 'number',
    description: 'Positive amount with up to 2 decimal places',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @ApiPropertyOptional({
    enum: ExpenseCategory,
    enumName: 'ExpenseCategory',
    description: 'Optional category, mirroring Expense.category.',
  })
  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @ApiPropertyOptional({
    type: [Number],
    description:
      'Contributor member user IDs for GROUP budgets. Updating this list updates budget payment rows.',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(1, { each: true })
  userIds?: number[];

  @ApiPropertyOptional({
    type: 'number',
    description:
      'Amount the user typed in their original currency. Must be provided together with originalCurrency.',
  })
  @ValidateIf((o) => o.originalCurrency !== undefined)
  @IsDefined({
    message: 'originalAmount is required when originalCurrency is provided',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  originalAmount?: number;

  @ApiPropertyOptional({
    enum: Currency,
    enumName: 'Currency',
    description:
      'Currency of the original amount. Must be provided together with originalAmount.',
  })
  @ValidateIf((o) => o.originalAmount !== undefined)
  @IsDefined({
    message: 'originalCurrency is required when originalAmount is provided',
  })
  @IsEnum(Currency)
  originalCurrency?: Currency;
}
