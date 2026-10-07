import { ApiProperty } from '@nestjs/swagger';

export class Web3EligibilityDto {
  @ApiProperty({
    description:
      'Caller may create/enable web3 trips: server web3 is on and configured, and the request IP is not in a blocked country or the caller is on the admin allowlist.',
  })
  eligible: boolean;

  @ApiProperty({
    description:
      'Informational only (UI copy): caller belongs to a web3 trip. Never grants web3 access; only `eligible` does.',
  })
  hasWeb3Trip: boolean;

  @ApiProperty({
    description:
      'A devnet test-USDC faucet is available to this caller (POST /web3/faucet).',
  })
  faucetEnabled: boolean;

  @ApiProperty({
    description:
      "Wallet choice, not an access grant: Android signs with the member's own wallet app over Mobile Wallet Adapter when true, with the Privy embedded wallet when false. iOS ignores it (always Privy).",
  })
  mwaEnabled: boolean;
}
