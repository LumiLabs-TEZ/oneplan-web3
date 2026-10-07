import { Module } from '@nestjs/common';
import { AdminGuard } from '../auth/guards/admin.guard';
import { Web3AllowlistAdminController } from './web3-allowlist-admin.controller';
import { Web3AllowlistService } from './web3-allowlist.service';
import { Web3FaucetService } from './faucet.service';
import { SeekerIdentityService } from './seeker-identity.service';
import { Web3Controller } from './web3.controller';
import { Web3EligibilityService } from './web3-eligibility.service';
import { Web3EligibleGuard } from './web3-eligible.guard';
import { Web3TripGuard } from './web3-trip.guard';

// PrismaModule and SolanaModule are @Global.
@Module({
  controllers: [Web3Controller, Web3AllowlistAdminController],
  providers: [
    Web3EligibilityService,
    Web3TripGuard,
    Web3EligibleGuard,
    Web3AllowlistService,
    Web3FaucetService,
    SeekerIdentityService,
    AdminGuard,
  ],
  exports: [
    Web3EligibilityService,
    Web3TripGuard,
    Web3EligibleGuard,
    SeekerIdentityService,
  ],
})
export class Web3Module {}
