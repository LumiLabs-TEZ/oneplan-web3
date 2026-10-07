import { Module } from '@nestjs/common';

import { ExpensesModule } from '../expenses/expenses.module';
import { PayoutModule } from '../payout/payout.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { Web3Module } from '../web3/web3.module';
import { TripVaultHistoryService } from './trip-vault-history.service';
import { TripVaultPayService } from './trip-vault-pay.service';
import { TripVaultSettlementService } from './trip-vault-settlement.service';
import { TripVaultReconcileService } from './trip-vault-reconcile.service';
import { TripVaultController } from './trip-vault.controller';
import { SiwsService } from './siws.service';
import { WalletController } from './wallet.controller';
import { WalletWithdrawService } from './wallet-withdraw.service';
import { TripVaultService } from './trip-vault.service';

@Module({
  imports: [PayoutModule, ExpensesModule, RealtimeModule, Web3Module],
  controllers: [TripVaultController, WalletController],
  providers: [
    TripVaultService,
    TripVaultPayService,
    TripVaultHistoryService,
    TripVaultSettlementService,
    TripVaultReconcileService,
    WalletWithdrawService,
    SiwsService,
  ],
  exports: [
    TripVaultService,
    TripVaultPayService,
    TripVaultHistoryService,
    TripVaultSettlementService,
  ],
})
export class TripVaultModule {}
