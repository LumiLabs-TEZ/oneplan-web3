import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class LookupRecipientDto {
  @ApiProperty({ description: 'Raw VietQR payload as scanned' })
  @IsString()
  @MaxLength(512)
  qrPayload: string;
}

export class RecipientDto {
  @ApiProperty({ description: 'Account holder name, as the bank reports it' })
  recipientName: string;

  @ApiProperty()
  bankBin: string;

  @ApiProperty()
  accountNumber: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Amount carried by the code, as a decimal string. Usually absent.',
  })
  amountVnd: string | null;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;
}
