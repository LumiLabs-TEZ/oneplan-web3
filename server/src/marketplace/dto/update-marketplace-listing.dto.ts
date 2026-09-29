import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  ValidateIf,
  MaxLength,
  Min,
} from 'class-validator';
import { Currency, ListingTag } from '@prisma/client';
import { NoProfanity } from '../../common/validators/no-profanity.decorator';

export class UpdateMarketplaceListingDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @NoProfanity()
  name?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @NoProfanity()
  description?: string;

  @ApiPropertyOptional({ maxLength: 2048 })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  coverImageUrl?: string;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  @IsOptional()
  @IsInt()
  cityId?: number | null;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  @IsOptional()
  @IsInt()
  stateId?: number | null;

  @ApiPropertyOptional({ type: 'integer' })
  @IsOptional()
  @IsInt()
  countryId?: number;

  @ApiPropertyOptional({ type: 'number' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ enum: Currency, enumName: 'Currency' })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiPropertyOptional({ type: 'integer', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number;

  @ApiPropertyOptional({
    maxLength: 255,
    nullable: true,
    description: 'Google Play product identifier used for Android purchases',
  })
  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(255)
  playProductId?: string | null;

  @ApiPropertyOptional({
    enum: ListingTag,
    enumName: 'ListingTag',
    isArray: true,
  })
  @IsOptional()
  @IsEnum(ListingTag, { each: true })
  @ArrayMinSize(1)
  tags?: ListingTag[];
}
