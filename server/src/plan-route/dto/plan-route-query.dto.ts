import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Min } from 'class-validator';

/**
 * Exactly one of `date` / `day` is required (enforced in the service):
 * `date` for scheduled trips (items keyed by `planDate`), `day` for PLANNING
 * trips (items keyed by `dayNumber`, no `planDate` yet).
 */
export class PlanRouteQueryDto {
  @ApiPropertyOptional({ description: 'ISO date string (YYYY-MM-DD)' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  })
  date?: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    description: '1-based day number (planning-mode trips)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  day?: number;
}
