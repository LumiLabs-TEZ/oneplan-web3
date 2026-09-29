import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Currency, ExpenseCategory } from '@prisma/client';

export class CreateExpenseDto {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ description: 'Positive amount with up to 2 decimal places' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({
    enum: ExpenseCategory,
    enumName: 'ExpenseCategory',
    default: ExpenseCategory.OTHER,
  })
  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @ApiProperty({
    type: 'array',
    items: { type: 'integer' },
    description: 'User IDs to split the expense among',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  memberIds: number[];

  @ApiPropertyOptional({
    type: 'integer',
    description:
      'Trip member who paid. Must be an accepted member of the trip. Defaults to the authenticated caller when omitted.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  paidById?: number;

  @ApiPropertyOptional({
    type: 'boolean',
    description:
      'When true, the expense is paid by the shared group wallet (paidById is stored as null). Takes precedence over paidById.',
  })
  @IsOptional()
  @IsBoolean()
  paidByGroup?: boolean;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiProperty({ description: 'ISO date string for the expense date' })
  @IsDateString()
  expenseDate: string;

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
