import { Module } from '@nestjs/common';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceAdminController } from './marketplace-admin.controller';
import { MarketplaceService } from './marketplace.service';
import { AdminGuard } from '../auth/guards/admin.guard';
import { StorageModule } from '../storage/storage.module';
import { TripsModule } from '../trips/trips.module';
import { MarketplacePurchaseVerifierService } from './marketplace-purchase-verifier.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { GooglePlayModule } from '../google-play/google-play.module';
import { MissionsModule } from '../missions/missions.module';
import { MarketplaceAcquisitionModule } from './acquisition/marketplace-acquisition.module';
import { GeminiModule } from '../common/gemini/gemini.module';
import { MarketplaceTranslationService } from './translation/marketplace-translation.service';

@Module({
  imports: [
    StorageModule,
    TripsModule,
    NotificationsModule,
    GooglePlayModule,
    MissionsModule,
    MarketplaceAcquisitionModule,
    GeminiModule,
  ],
  controllers: [MarketplaceController, MarketplaceAdminController],
  providers: [
    MarketplaceService,
    MarketplacePurchaseVerifierService,
    MarketplaceTranslationService,
    AdminGuard,
  ],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}
