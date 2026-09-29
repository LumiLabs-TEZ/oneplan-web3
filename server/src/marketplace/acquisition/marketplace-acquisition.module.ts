import { Module } from '@nestjs/common';
import { MarketplaceAcquisitionService } from './marketplace-acquisition.service';

// Standalone on purpose (depends only on the global PrismaModule): imported by
// both MarketplaceModule and MissionsModule without creating a cycle.
@Module({
  providers: [MarketplaceAcquisitionService],
  exports: [MarketplaceAcquisitionService],
})
export class MarketplaceAcquisitionModule {}
