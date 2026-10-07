import { ApiProperty } from '@nestjs/swagger';
import { IsBase64, IsString, MaxLength } from 'class-validator';

export class SiwsInputDto {
  @ApiProperty() domain: string;
  @ApiProperty() statement: string;
  @ApiProperty() uri: string;
  @ApiProperty() version: string;
  @ApiProperty() chainId: string;
  @ApiProperty() nonce: string;
  @ApiProperty({ description: 'ISO-8601' }) issuedAt: string;
  @ApiProperty({ description: 'ISO-8601' }) expirationTime: string;
}

export class SiwsChallengeDto {
  @ApiProperty({
    type: SiwsInputDto,
    description: 'Pass verbatim as MWA sign_in_payload',
  })
  input: SiwsInputDto;

  @ApiProperty({
    description: 'Opaque; send back unchanged to POST /wallet/link/siws',
  })
  challengeToken: string;
}

export class LinkWalletSiwsDto {
  @ApiProperty() @IsString() @MaxLength(2048) challengeToken: string;

  @ApiProperty({
    description: 'MWA sign_in_result.address (base64 public key)',
  })
  @IsBase64()
  @MaxLength(64)
  address: string;

  @ApiProperty({ description: 'MWA sign_in_result.signed_message (base64)' })
  @IsBase64()
  @MaxLength(4096)
  signedMessage: string;

  @ApiProperty({ description: 'MWA sign_in_result.signature (base64)' })
  @IsBase64()
  @MaxLength(128)
  signature: string;
}
