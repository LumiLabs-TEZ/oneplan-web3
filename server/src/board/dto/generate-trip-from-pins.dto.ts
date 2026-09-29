import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { PinInputDto } from './add-pins-to-board.dto';
import { GenerateTripOptionsDto } from './generate-trip-from-board.dto';

// Generate a trip straight from freshly-extracted pins, without persisting a
// Board first. The destination that a Board row would normally supply is sent
// inline instead.
export class GenerateTripFromPinsDto extends GenerateTripOptionsDto {
  @ApiProperty({
    type: [PinInputDto],
    minItems: 1,
    maxItems: 40,
    description:
      'Pins to arrange, in the order they were extracted (this order is the ' +
      'within-day tiebreak when pins carry no usable time)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => PinInputDto)
  pins: PinInputDto[];

  @ApiPropertyOptional({ type: 'integer' })
  @IsOptional()
  @IsInt()
  cityId?: number;

  @ApiProperty({ type: 'integer' })
  @IsInt()
  stateId: number;

  @ApiProperty({ type: 'integer' })
  @IsInt()
  countryId: number;
}
