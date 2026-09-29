import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency } from '@prisma/client';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export const TRIP_GENERATOR_PLAN_FOR = [
  'Friends',
  'Family',
  'Company trip',
  'Couple',
  'Solo',
] as const;
export type TripGeneratorPlanFor = (typeof TRIP_GENERATOR_PLAN_FOR)[number];

export const TRIP_GENERATOR_LANGUAGES = [
  'Tiếng Việt',
  'English',
  '日本語',
  '한국어',
  '中文',
  'Français',
] as const;
export type TripGeneratorLanguage = (typeof TRIP_GENERATOR_LANGUAGES)[number];

export class GenerateTripPlanDto {
  @ApiProperty({ maxLength: 200, example: 'Da Lat, Vietnam' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  destination: string;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 14 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(14)
  days: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 50,
    description:
      'Number of travelers in the group. Shapes group logistics (table sizes, group-friendly venues, shareable food).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  numberOfPeople?: number;

  @ApiProperty({
    maxLength: 100,
    description: 'Free-text budget per person, e.g. "5.000.000"',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  budget: string;

  @ApiProperty({ enum: Currency, enumName: 'Currency' })
  @IsEnum(Currency)
  currency: Currency;

  @ApiProperty({ enum: TRIP_GENERATOR_PLAN_FOR })
  @IsIn(TRIP_GENERATOR_PLAN_FOR)
  planFor: TripGeneratorPlanFor;

  @ApiPropertyOptional({
    maxLength: 2000,
    description: 'Desired vibe; strongest signal when picking places',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  vibe?: string;

  @ApiProperty({ enum: TRIP_GENERATOR_LANGUAGES })
  @IsIn(TRIP_GENERATOR_LANGUAGES)
  language: TripGeneratorLanguage;

  @ApiPropertyOptional({
    maxLength: 255,
    description: 'Optional trip name; the model picks one when empty',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  tripName?: string;

  // Exact location ids (e.g. carried over from a trip request). When absent,
  // create-listing best-effort resolves them from `destination` by name so
  // the listing lands in admin review with location already filled.
  @ApiPropertyOptional({ type: 'integer' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cityId?: number;

  @ApiPropertyOptional({ type: 'integer' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  stateId?: number;

  @ApiPropertyOptional({ type: 'integer' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  countryId?: number;
}
