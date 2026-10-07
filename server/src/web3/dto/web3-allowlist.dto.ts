import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class AddWeb3AllowlistDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Email of an existing account',
  })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    maxLength: 200,
    description: 'Why this user is allowlisted (e.g. "Demo Day phone")',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class Web3AllowlistEntryDto {
  @ApiProperty({ type: 'integer' })
  userId: number;

  @ApiProperty()
  email: string;

  @ApiProperty()
  displayName: string;

  @ApiPropertyOptional({ type: 'string', nullable: true })
  note: string | null;

  @ApiProperty({ description: 'Admin who added the user' })
  addedByEmail: string;

  @ApiProperty({ description: 'ISO timestamp' })
  createdAt: string;
}
