import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Trip "vibes" the user can pick before generating. Request-only (never
// persisted); the AI keeps only the pins that fit the chosen vibes.
export enum TripVibe {
  FOOD_TOUR = 'FOOD_TOUR',
  LANDMARKS_CULTURE = 'LANDMARKS_CULTURE',
  NATURE_OUTDOORS = 'NATURE_OUTDOORS',
  NIGHTLIFE = 'NIGHTLIFE',
  SHOPPING = 'SHOPPING',
  RELAX_WELLNESS = 'RELAX_WELLNESS',
}

// Shared arrange options — used by both the board-backed route and the inline
// pins route (see GenerateTripFromPinsDto).
export class GenerateTripOptionsDto {
  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: 14,
    description: 'How many days to spread the pins across',
  })
  @IsInt()
  @Min(1)
  @Max(14)
  dayCount: number;

  @ApiProperty({ maxLength: 255, description: 'Name for the new trip' })
  @IsString()
  @MaxLength(255)
  tripName: string;

  @ApiProperty({
    type: 'boolean',
    required: false,
    default: false,
    description:
      'When true, the AI may add clearly-marked suggested venues to fill ' +
      'empty meal/sightseeing slots. Defaults to false (pins only).',
  })
  @IsOptional()
  @IsBoolean()
  fillGaps?: boolean;

  @ApiProperty({
    enum: TripVibe,
    enumName: 'TripVibe',
    isArray: true,
    required: false,
    description:
      'Desired trip vibes. When present, only the pins that fit at least one ' +
      'vibe are placed in the trip; the rest are left on the board. ' +
      'Absent/empty = use every selected pin.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsEnum(TripVibe, { each: true })
  vibes?: TripVibe[];
}

export class GenerateTripFromBoardDto extends GenerateTripOptionsDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'integer' },
    description: 'IDs of the board pins to arrange into the trip',
    minItems: 1,
    maxItems: 40,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @IsInt({ each: true })
  pinIds: number[];
}
