import { Module } from '@nestjs/common';
import { Web3Controller } from './web3.controller';
import { Web3EligibilityService } from './web3-eligibility.service';
import { Web3EligibleGuard } from './web3-eligible.guard';
import { Web3TripGuard } from './web3-trip.guard';

// PrismaModule and SolanaModule are @Global.
@Module({
  controllers: [Web3Controller],
  providers: [Web3EligibilityService, Web3TripGuard, Web3EligibleGuard],
  exports: [Web3EligibilityService, Web3TripGuard, Web3EligibleGuard],
})
export class Web3Module {}
