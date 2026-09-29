import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type PlanRouteLegMode = 'walk' | 'drive';

export class PlanRouteLegDto {
  @ApiPropertyOptional({
    description: 'Encoded polyline (Google algorithm, precision 5)',
  })
  polyline: string | null;

  @ApiPropertyOptional({ type: 'integer' })
  durationSec: number | null;

  @ApiPropertyOptional({ type: 'number' })
  distanceM: number | null;

  @ApiProperty({
    enum: ['walk', 'drive'],
    enumName: 'PlanRouteLegMode',
    description:
      'Travel mode for this leg: walking when the stops are under 1 km apart (straight line), otherwise driving',
  })
  mode: PlanRouteLegMode;
}
