import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTripDto {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  name: string;

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

  @ApiPropertyOptional({
    enum: Currency,
    enumName: 'Currency',
    description: 'Trip currency. Defaults to user preferred currency.',
  })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiPropertyOptional({
    enum: Currency,
    enumName: 'Currency',
    isArray: true,
    description:
      'Additional local currencies used on the trip. If omitted, a single currency is auto-suggested from the trip country when it differs from the home currency. Up to 5 entries.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsEnum(Currency, { each: true })
  localCurrencies?: Currency[];

  @ApiPropertyOptional({
    description:
      'Create the trip with a group wallet (web3). Fixed at creation. Requires web3 eligibility (403 web3_unavailable otherwise).',
  })
  @IsOptional()
  @IsBoolean()
  web3?: boolean;
}
