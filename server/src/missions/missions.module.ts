import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ScanCreditModule } from '../scan-credit/scan-credit.module';
import { MarketplaceAcquisitionModule } from '../marketplace/acquisition/marketplace-acquisition.module';
import { MissionsController } from './missions.controller';
import { MissionsAdminController } from './missions-admin.controller';
import { MissionConfigService } from './mission-config.service';
import { MissionsService } from './missions.service';

// Missions & Rewards (spark ⚡). Host modules (trips, expenses, board,
// plan-items, marketplace, …) import THIS module and fire-and-forget the onX
// trigger handlers; missions never imports a host module back (the
// marketplace dependency is the shared MarketplaceAcquisitionModule, not
// MarketplaceModule — that would be circular; NotificationsModule is a leaf,
// so it's safe too). AnalyticsModule and PrismaModule are @Global.
@Module({
  imports: [
    ScanCreditModule,
    MarketplaceAcquisitionModule,
    NotificationsModule,
  ],
  controllers: [MissionsController, MissionsAdminController],
  providers: [MissionsService, MissionConfigService],
  exports: [MissionsService],
})
export class MissionsModule {}
