import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseCategory } from '@prisma/client';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** Metadata edits for a confirmed vault spend. Amount is intentionally omitted. */
export class UpdateVaultSpendDto {
  @ApiPropertyOptional({
    maxLength: 255,
    description: 'Expense / TX display name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    enum: ExpenseCategory,
    enumName: 'ExpenseCategory',
  })
  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @ApiPropertyOptional({
    type: 'integer',
    isArray: true,
    description:
      'Members who share this spend. Empty array means shared by everyone.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  shareWithUserIds?: number[];
}
