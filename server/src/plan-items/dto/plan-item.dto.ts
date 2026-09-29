import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseCategory } from '@prisma/client';
import { PlanItemMemberDto } from './plan-item-member.dto';

export class PlanItemDto {
  @ApiProperty({ type: 'integer' })
  id: number;

  @ApiProperty({ type: 'integer' })
  tripId: number;

  @ApiPropertyOptional({
    description: 'YYYY-MM-DD, null during PLANNING when dayNumber is used',
  })
  planDate: string | null;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiPropertyOptional()
  location: string | null;

  @ApiPropertyOptional({ type: 'number' })
  latitude: number | null;

  @ApiPropertyOptional({ type: 'number' })
  longitude: number | null;

  @ApiPropertyOptional()
  address: string | null;

  @ApiPropertyOptional({ description: 'HH:MM format' })
  startTime: string | null;

  @ApiPropertyOptional({ enum: ExpenseCategory, enumName: 'ExpenseCategory' })
  category: ExpenseCategory | null;

  @ApiPropertyOptional()
  voiceUrl: string | null;

  @ApiPropertyOptional({ type: 'integer' })
  voiceDuration: number | null;

  @ApiProperty({
    type: [String],
    description: 'Signed image URLs (max 5)',
  })
  imageUrls: string[];

  @ApiPropertyOptional({
    type: 'integer',
    description: 'Relative day number (1-based), set during PLANNING status',
  })
  dayNumber: number | null;

  @ApiProperty({ type: 'integer' })
  sortOrder: number;

  @ApiProperty()
  createdAt: string;

  @ApiProperty({ type: [PlanItemMemberDto] })
  members: PlanItemMemberDto[];
}
