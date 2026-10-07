import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Display-only Seeker identity of a trip member with an MWA-linked wallet. */
export class MemberIdentityDto {
  @ApiProperty({ type: 'integer' })
  userId: number;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Primary .skr name without the suffix (mainnet)',
  })
  skrDomain: string | null;

  @ApiProperty({
    description: 'The linked key holds a Seeker Genesis Token (mainnet)',
  })
  isSeeker: boolean;
}
