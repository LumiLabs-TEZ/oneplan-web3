import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Currency, ExpenseCategory } from '@prisma/client';

export class ReceiptExpenseItemDto {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ description: 'Item amount with up to 2 decimal places' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @ApiProperty({
    type: 'integer',
    description: 'User ID this item is assigned to',
  })
  @IsInt()
  userId: number;
}

export class CreateReceiptExpenseDto {
  @ApiProperty({ maxLength: 255, description: 'Restaurant or receipt name' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    enum: ExpenseCategory,
    enumName: 'ExpenseCategory',
    default: ExpenseCategory.FOOD,
  })
  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @ApiPropertyOptional({
    type: 'integer',
    description:
      'Trip member who paid. Must be an accepted member of the trip. Defaults to the authenticated caller when omitted — the scanner is often not the payer.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  paidById?: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiProperty({ description: 'ISO date string for the expense date' })
  @IsDateString()
  expenseDate: string;

  @ApiProperty({
    type: [ReceiptExpenseItemDto],
    description: 'Individual item assignments from the receipt',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReceiptExpenseItemDto)
  items: ReceiptExpenseItemDto[];

  @ApiPropertyOptional({
    enum: Currency,
    enumName: 'Currency',
    description:
      'Currency the item amounts are expressed in. Defaults to the trip currency. The original total is derived as the sum of item amounts and converted to the trip currency server-side.',
  })
  @IsOptional()
  @IsEnum(Currency)
  originalCurrency?: Currency;
}
