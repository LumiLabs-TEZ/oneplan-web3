import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Currency, ListingTag } from '@prisma/client';
import { NoProfanity } from '../../common/validators/no-profanity.decorator';

export class CreateTripRequestDto {
  @ApiPropertyOptional({ type: 'integer' })
  @IsOptional()
  @IsInt()
  cityId?: number;

  @ApiPropertyOptional({ type: 'integer' })
  @IsOptional()
  @IsInt()
  stateId?: number;

  @ApiPropertyOptional({ type: 'integer' })
  @IsOptional()
  @IsInt()
  countryId?: number;

  @ApiProperty({ enum: ListingTag, enumName: 'ListingTag' })
  @IsEnum(ListingTag)
  tag: ListingTag;

  @ApiPropertyOptional({
    type: 'number',
    description: 'Requested budget in the given currency',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  budget?: number;

  @ApiProperty({ enum: Currency, enumName: 'Currency' })
  @IsEnum(Currency)
  currency: Currency;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 50,
    description: 'Number of people joining the trip',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  participantCount?: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 30,
    description: 'Desired trip length in days',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  dayCount?: number;

  @ApiPropertyOptional({
    maxLength: 1000,
    description: 'Free-text description of the requested trip',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @NoProfanity()
  description?: string;
}
