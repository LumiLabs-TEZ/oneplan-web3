import { Module } from '@nestjs/common';
import { TractionController } from './traction.controller';
import { TractionService } from './traction.service';

@Module({
  controllers: [TractionController],
  providers: [TractionService],
})
export class TractionModule {}
