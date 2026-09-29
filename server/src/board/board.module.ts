import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ScanCreditModule } from '../scan-credit/scan-credit.module';
import { StorageModule } from '../storage/storage.module';
import { TripsModule } from '../trips/trips.module';
import { MissionsModule } from '../missions/missions.module';
import { BoardController } from './board.controller';
import { GeminiModule } from '../common/gemini/gemini.module';
import { BoardService } from './board.service';
import { PinExtractionController } from './pin-extraction.controller';
import { PinExtractionService } from './pin-extraction.service';
import { VideoResolverService } from './video-resolver.service';

@Module({
  imports: [
    StorageModule,
    NotificationsModule,
    ScanCreditModule,
    GeminiModule,
    TripsModule,
    MissionsModule,
  ],
  controllers: [BoardController, PinExtractionController],
  providers: [BoardService, PinExtractionService, VideoResolverService],
})
export class BoardModule {}
