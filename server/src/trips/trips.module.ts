import { Module } from '@nestjs/common';
import { BudgetsModule } from '../budgets/budgets.module';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlanItemsModule } from '../plan-items/plan-items.module';
import { TripVaultModule } from '../trip-vault/trip-vault.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { StorageModule } from '../storage/storage.module';
import { MissionsModule } from '../missions/missions.module';
import { TripEndConsensusService } from './trip-end-consensus.service';
import { Web3Module } from '../web3/web3.module';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { TripAutoStartService } from './trip-auto-start.service';

@Module({
  imports: [
    StorageModule,
    BudgetsModule,
    ExchangeRatesModule,
    RealtimeModule,
    NotificationsModule,
    PlanItemsModule,
    MissionsModule,
    TripVaultModule,
    Web3Module,
  ],
  controllers: [TripsController],
  providers: [TripsService, TripAutoStartService, TripEndConsensusService],
  exports: [TripsService],
})
export class TripsModule {}
