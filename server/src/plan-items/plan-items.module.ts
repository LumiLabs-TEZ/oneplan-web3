import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { MissionsModule } from '../missions/missions.module';
import { MarketplaceAcquisitionModule } from '../marketplace/acquisition/marketplace-acquisition.module';
import { PlanItemsController } from './plan-items.controller';
import { PlanItemStatsController } from './plan-item-stats.controller';
import { PlanItemsService } from './plan-items.service';

@Module({
  imports: [StorageModule, MissionsModule, MarketplaceAcquisitionModule],
  controllers: [PlanItemsController, PlanItemStatsController],
  providers: [PlanItemsService],
  exports: [PlanItemsService],
})
export class PlanItemsModule {}
