import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Currency, ListingTag } from '@prisma/client';
import { NoProfanity } from '../../common/validators/no-profanity.decorator';

export class CreateDraftListingDto {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  @NoProfanity()
  name: string;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  @IsOptional()
  @IsInt()
  cityId?: number | null;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  @IsOptional()
  @IsInt()
  stateId?: number | null;

  @ApiProperty({ type: 'integer' })
  @IsInt()
  @Min(1)
  countryId: number;

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

  @ApiPropertyOptional({
    type: 'number',
    description: 'Price in local currency',
  })
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
    enum: ListingTag,
    enumName: 'ListingTag',
    isArray: true,
  })
  @IsOptional()
  @IsEnum(ListingTag, { each: true })
  @ArrayMinSize(1)
  tags?: ListingTag[];
}
