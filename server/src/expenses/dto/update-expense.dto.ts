import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsEnum,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Currency, ExpenseCategory } from '@prisma/client';

export class UpdateExpenseDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    description: 'Positive amount with up to 2 decimal places',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @ApiPropertyOptional({
    enum: ExpenseCategory,
    enumName: 'ExpenseCategory',
  })
  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({
    description: 'ISO date-time string for the expense date',
  })
  @IsOptional()
  @IsDateString()
  expenseDate?: string;

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'integer' },
    description: 'User IDs to split the expense among',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(1, { each: true })
  memberIds?: number[];

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

  @ApiPropertyOptional({
    type: 'integer',
    description:
      'Trip member who paid. Must be an accepted member of the trip. Omit to leave the payer unchanged.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  paidById?: number;

  @ApiPropertyOptional({
    type: 'boolean',
    description:
      'When true, the expense is paid by the shared group wallet (paidById cleared to null). Takes precedence over paidById.',
  })
  @IsOptional()
  @IsBoolean()
  paidByGroup?: boolean;
}
