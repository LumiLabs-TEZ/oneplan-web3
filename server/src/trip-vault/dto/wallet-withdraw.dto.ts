import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class InspectRecipientDto {
  @ApiProperty({ description: 'The Solana address the member pasted' })
  @IsString()
  @IsNotEmpty()
  address: string;
}

export class RecipientCheckDto {
  @ApiProperty()
  address: string;

  @ApiProperty({
    description:
      'True when this address has never held USDC. Usually a fresh wallet, ' +
      'sometimes a typo — the difference cannot be known from here.',
  })
  isNew: boolean;
}

export class BuildWithdrawalDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ description: 'Amount in micro-USDC as a decimal string' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+$/)
  @MaxLength(20)
  amountMicro: string;
}

export class WithdrawalTxDto {
  @ApiProperty({ description: 'Unsigned transaction, base64' })
  base64Tx: string;

  @ApiProperty({
    description:
      'True when the transfer also opens the recipient a USDC account, which ' +
      'this server pays the rent for.',
  })
  createsRecipientAccount: boolean;
}

export class WithdrawalResultDto {
  @ApiProperty()
  signature: string;

  @ApiProperty({
    description:
      'CONFIRMED, or PENDING when the transfer reached the chain but its ' +
      'confirmation did not reach us. Never FAILED on a lost answer.',
  })
  status: string;
}
