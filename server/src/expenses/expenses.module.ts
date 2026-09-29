import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { StorageModule } from '../storage/storage.module';
import { MissionsModule } from '../missions/missions.module';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

@Module({
  imports: [StorageModule, RealtimeModule, MissionsModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
