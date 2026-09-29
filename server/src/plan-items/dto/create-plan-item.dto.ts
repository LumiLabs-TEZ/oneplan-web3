import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseCategory } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
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

export class CreatePlanItemDto {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({
    description:
      'ISO date string (YYYY-MM-DD). Required if dayNumber is not provided.',
  })
  @ValidateIf((o) => !o.dayNumber)
  @IsDateString()
  @IsOptional()
  planDate?: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    description:
      'Relative day number (1-based). Required if planDate is not provided.',
  })
  @ValidateIf((o) => !o.planDate)
  @IsInt()
  @Min(1)
  @IsOptional()
  dayNumber?: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string;

  @ApiPropertyOptional({ type: 'number', minimum: -90, maximum: 90 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ type: 'number', minimum: -180, maximum: 180 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

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

  @ApiPropertyOptional({ description: 'S3 object key for the voice recording' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  voiceUrl?: string;

  @ApiPropertyOptional({
    type: 'integer',
    description: 'Voice recording duration in seconds',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  voiceDuration?: number;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 5,
    description: 'Image URLs or object keys (max 5)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  imageUrls?: string[];

  @ApiProperty({
    type: [Number],
    description: 'User IDs to assign',
    minItems: 1,
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(1, { each: true })
  userIds: number[];
}
