import { ForbiddenException } from '@nestjs/common';
import { TripVaultController } from './trip-vault.controller';

function deps() {
  return {
    vaultService: {
      assertMember: jest.fn().mockResolvedValue(undefined),
      assertHost: jest.fn().mockResolvedValue(undefined),
      linkWallet: jest.fn().mockResolvedValue({ publicKey: 'PK' }),
      requireVault: jest.fn().mockResolvedValue({
        vaultPda: 'VaultPda',
        thresholdMicro: 10_000_000n,
        dailyLimitMicro: 50_000_000n,
      }),
      getBalance: jest.fn().mockResolvedValue({
        balanceMicro: 1_234_567n,
        vaultPda: 'VaultPda',
      }),
      buildDepositTx: jest.fn().mockResolvedValue('base64tx'),
      syncMembers: jest.fn().mockResolvedValue(2),
    },
    payService: {
      quote: jest.fn().mockResolvedValue({
        recipientName: 'NGUYEN VAN A',
        bankBin: '970412',
        accountNumber: '109000636588',
        amountVnd: 200_000n,
        amountUsdcMicro: 7_660_000n,
        feeMicro: 57_450n,
        rate: '26500',
        needsApproval: false,
        description: null,
      }),
      preparePayment: jest.fn(),
      submitPayment: jest.fn(),
      abandonPayment: jest.fn().mockResolvedValue({ status: 'FAILED' }),
      buildApprovalTx: jest.fn(),
    },
    historyService: {
      getHistory: jest.fn().mockResolvedValue([]),
      getTransactionDetail: jest.fn(),
    },
    settlementService: {
      preview: jest.fn(),
      confirmCashDebt: jest.fn(),
      executeFromServer: jest.fn(),
    },
  };
}

const USER_ID = 7;

function build(d: ReturnType<typeof deps>): TripVaultController {
  return new TripVaultController(
    d.vaultService as never,
    d.payService as never,
    d.historyService as never,
    d.settlementService as never,
  );
}

describe('TripVaultController', () => {
  it('serialises balances as decimal strings, never numbers', async () => {
    const result = await build(deps()).getBalance(42, USER_ID);

    expect(result.balanceMicro).toBe('1234567');
    expect(typeof result.balanceMicro).toBe('string');
    expect(typeof result.thresholdMicro).toBe('string');
    expect(typeof result.dailyLimitMicro).toBe('string');
  });

  it('serialises quote amounts as decimal strings', async () => {
    const result = await build(deps()).quote(42, { qrPayload: 'x' }, USER_ID);

    expect(result.amountVnd).toBe('200000');
    expect(result.amountUsdcMicro).toBe('7660000');
    expect(result.feeMicro).toBe('57450');
    expect(result.needsApproval).toBe(false);
  });

  it('passes an amount override through as a bigint', async () => {
    const d = deps();
    await build(d).quote(42, { qrPayload: 'x', amountVnd: '350000' }, USER_ID);

    expect(d.payService.quote).toHaveBeenCalledWith(
      42,
      7,
      'x',
      350_000n,
      'VAULT',
    );
  });

  it('passes a deposit amount through as a bigint', async () => {
    const d = deps();
    await build(d).deposit(42, { amountMicro: '5000000' }, USER_ID);

    expect(d.vaultService.buildDepositTx).toHaveBeenCalledWith(
      42,
      7,
      5_000_000n,
    );
  });

  describe('trip-membership checks (IDOR)', () => {
    function notAMember(d: ReturnType<typeof deps>) {
      d.vaultService.assertMember = jest
        .fn()
        .mockRejectedValue(
          new ForbiddenException('You are not a member of this trip'),
        );
      return d;
    }

    it('rejects getBalance for a non-member without touching the vault', async () => {
      const d = notAMember(deps());
      await expect(build(d).getBalance(42, USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
      expect(d.vaultService.requireVault).not.toHaveBeenCalled();
      expect(d.vaultService.getBalance).not.toHaveBeenCalled();
    });

    it('rejects getHistory for a non-member without reading the ledger', async () => {
      const d = notAMember(deps());
      await expect(build(d).getHistory(42, USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
      expect(d.historyService.getHistory).not.toHaveBeenCalled();
    });

    it('rejects getSettlement for a non-member without previewing it', async () => {
      const d = notAMember(deps());
      await expect(build(d).getSettlement(42, USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
      expect(d.settlementService.preview).not.toHaveBeenCalled();
    });

    it('rejects pay/quote for a non-member', async () => {
      const d = notAMember(deps());
      await expect(
        build(d).quote(42, { qrPayload: 'x' }, USER_ID),
      ).rejects.toThrow(ForbiddenException);
      expect(d.payService.quote).not.toHaveBeenCalled();
    });

    it('rejects pay/prepare for a non-member', async () => {
      const d = notAMember(deps());
      await expect(
        build(d).preparePayment(42, { qrPayload: 'x' } as never, USER_ID),
      ).rejects.toThrow(ForbiddenException);
      expect(d.payService.preparePayment).not.toHaveBeenCalled();
    });

    it('rejects building a deposit tx for a non-member', async () => {
      const d = notAMember(deps());
      await expect(
        build(d).deposit(42, { amountMicro: '5000000' }, USER_ID),
      ).rejects.toThrow(ForbiddenException);
      expect(d.vaultService.buildDepositTx).not.toHaveBeenCalled();
    });

    it('rejects linking a wallet for a non-member', async () => {
      const d = notAMember(deps());
      await expect(
        build(d).linkWallet(42, { publicKey: 'PK' }, USER_ID),
      ).rejects.toThrow(ForbiddenException);
      expect(d.vaultService.linkWallet).not.toHaveBeenCalled();
    });

    it('rejects confirming a cash debt for a non-member', async () => {
      const d = notAMember(deps());
      await expect(
        build(d).confirmCashDebt(42, { fromUserId: 3 }, USER_ID),
      ).rejects.toThrow(ForbiddenException);
      expect(d.settlementService.confirmCashDebt).not.toHaveBeenCalled();
    });

    it('rejects an explicit createVault for a member who is not the host', async () => {
      const d = deps();
      d.vaultService.assertHost = jest
        .fn()
        .mockRejectedValue(
          new ForbiddenException('Only the trip host can do this'),
        );
      d.vaultService.createVault = jest.fn();
      await expect(build(d).createVault(42, {}, USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
      expect(d.vaultService.createVault).not.toHaveBeenCalled();
    });

    it('rejects a manual member re-sync for a non-host', async () => {
      const d = deps();
      d.vaultService.assertHost = jest
        .fn()
        .mockRejectedValue(
          new ForbiddenException('Only the trip host can do this'),
        );
      await expect(build(d).syncMembers(42, USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
      expect(d.vaultService.syncMembers).not.toHaveBeenCalled();
    });
  });
});
