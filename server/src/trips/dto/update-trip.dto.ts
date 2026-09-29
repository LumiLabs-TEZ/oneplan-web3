import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Currency, TripStatus } from '@prisma/client';

export class UpdateTripDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'ISO date string (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'ISO date string (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ type: 'integer' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cityId?: number;

  @ApiPropertyOptional({ type: 'integer' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  stateId?: number;

  @ApiPropertyOptional({ type: 'integer' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  countryId?: number;

  @ApiPropertyOptional({ enum: TripStatus, enumName: 'TripStatus' })
  @IsOptional()
  @IsEnum(TripStatus)
  status?: TripStatus;

  @ApiPropertyOptional({
    enum: Currency,
    enumName: 'Currency',
    description:
      'Trip currency. Changing it converts all existing budgets/expenses ' +
      'to the new currency at current rates. Not allowed on ended trips.',
  })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiPropertyOptional({
    enum: Currency,
    enumName: 'Currency',
    isArray: true,
    description:
      'Additional local currencies used on the trip. Can be edited at any time. Up to 5 entries.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsEnum(Currency, { each: true })
  localCurrencies?: Currency[];
}
