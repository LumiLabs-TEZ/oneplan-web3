import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContentLocale } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { NoProfanity } from '../../common/validators/no-profanity.decorator';

export class UpsertItemTranslationDto {
  @ApiProperty({ type: 'integer' })
  @IsInt()
  itemId: number;

  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  @NoProfanity()
  title: string;

  @ApiPropertyOptional({ maxLength: 500, type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @NoProfanity()
  description?: string | null;
}

/** Replace the translation of a listing (and its items) for one locale. */
export class UpsertListingTranslationDto {
  @ApiProperty({ enum: ContentLocale, enumName: 'ContentLocale' })
  @IsEnum(ContentLocale)
  locale: ContentLocale;

  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  @NoProfanity()
  name: string;

  @ApiPropertyOptional({ maxLength: 500, type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @NoProfanity()
  description?: string | null;

  @ApiProperty({ type: [UpsertItemTranslationDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertItemTranslationDto)
  items: UpsertItemTranslationDto[];
}

export class GenerateListingTranslationDto {
  @ApiProperty({ enum: ContentLocale, enumName: 'ContentLocale' })
  @IsEnum(ContentLocale)
  locale: ContentLocale;
}
