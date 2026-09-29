import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseCategory } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdatePlanItemDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({
    description: 'ISO date string (YYYY-MM-DD)',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  planDate?: string | null;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  location?: string | null;

  @ApiPropertyOptional({
    type: 'number',
    minimum: -90,
    maximum: 90,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @ApiPropertyOptional({
    type: 'number',
    minimum: -180,
    maximum: 180,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @ApiPropertyOptional({ description: 'HH:MM format (e.g. 09:30)' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime?: string;

  @ApiPropertyOptional({ enum: ExpenseCategory, enumName: 'ExpenseCategory' })
  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @ApiPropertyOptional({ type: 'integer', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({
    description: 'S3 object key for the voice recording',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  voiceUrl?: string | null;

  @ApiPropertyOptional({
    type: 'integer',
    description: 'Voice recording duration in seconds',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  voiceDuration?: number | null;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    description: 'Relative day number (1-based)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  dayNumber?: number;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 5,
    description:
      'Image URLs or object keys (max 5). If provided, replaces the entire image list.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  imageUrls?: string[];

  @ApiPropertyOptional({
    type: [Number],
    description: 'If provided, replaces the entire member list.',
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  userIds?: number[];
}
