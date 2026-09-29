import { ApiProperty } from '@nestjs/swagger';

export class Web3EligibilityDto {
  @ApiProperty({
    description:
      'Caller may create/enable web3 trips: server web3 is on and configured, and the request IP is not in a blocked country.',
  })
  eligible: boolean;

  @ApiProperty({
    description:
      'Informational only (UI copy): caller belongs to a web3 trip. Never grants web3 access; only `eligible` does.',
  })
  hasWeb3Trip: boolean;
}
