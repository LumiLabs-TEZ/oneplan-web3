import type { VaultTransactionDetailDto } from '../api/queries';
import { mapVaultTransactionDetail } from './transactionDetailMapping';

function dto(overrides: Partial<VaultTransactionDetailDto> = {}): VaultTransactionDetailDto {
  return {
    id: 42,
    status: 'CONFIRMED',
    needsApproval: false,
    canApprove: false,
    canCancel: false,
    canEdit: true,
    amountVnd: '200000',
    amountUsdcMicro: '7660000',
    recipientName: 'Nguyen Van A',
    bankName: 'Techcombank',
    bankAccountNumber: '0271003061328',
    feeMicro: '57450',
    rate: '26500',
    shareWith: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('mapVaultTransactionDetail', () => {
  it('maps status CONFIRMED/FAILED/PENDING to completed/failed/pending', () => {
    expect(mapVaultTransactionDetail(dto({ status: 'CONFIRMED' })).status).toBe('completed');
    expect(mapVaultTransactionDetail(dto({ status: 'FAILED' })).status).toBe('failed');
    expect(mapVaultTransactionDetail(dto({ status: 'PENDING' })).status).toBe('pending');
  });

  it('derives fee VND and fee percent from feeMicro/amountUsdcMicro/rate', () => {
    const detail = mapVaultTransactionDetail(
      dto({ feeMicro: '57450', amountUsdcMicro: '7660000', rate: '26500' }),
    );
    expect(detail.feeUsdc).toBeCloseTo(0.05745);
    expect(detail.feeVnd).toBeCloseTo(1522.425);
    expect(detail.feePercent).toBeCloseTo(0.75, 5);
  });

  it('feePercent is 0 when amountUsdcMicro is 0 (no divide-by-zero)', () => {
    expect(mapVaultTransactionDetail(dto({ amountUsdcMicro: '0' })).feePercent).toBe(0);
  });

  it('falls back to fallbackName when the server has no name yet', () => {
    expect(mapVaultTransactionDetail(dto({ name: undefined }), 'Cafe').name).toBe('Cafe');
  });

  it('prefers the server name over the fallback', () => {
    expect(mapVaultTransactionDetail(dto({ name: 'Coffee run' }), 'Cafe').name).toBe('Coffee run');
  });

  it('shareWithNames is an empty array (not null) when everyone shares', () => {
    const detail = mapVaultTransactionDetail(dto({ shareWith: [] }));
    expect(detail.shareWithNames).toEqual([]);
    expect(detail.shareWithUserIds).toEqual([]);
  });

  it('maps shareWith to both display names and user ids', () => {
    const detail = mapVaultTransactionDetail(
      dto({
        shareWith: [
          { userId: 1, displayName: 'Nam', avatarUrl: null },
          { userId: 2, displayName: 'An', avatarUrl: null },
        ],
      }),
    );
    expect(detail.shareWithNames).toEqual(['Nam', 'An']);
    expect(detail.shareWithUserIds).toEqual([1, 2]);
  });

  it('paidByName is null when the group paid (no paidBy on the DTO)', () => {
    expect(mapVaultTransactionDetail(dto()).paidByName).toBeNull();
  });

  it('maps paidBy/madeBy to plain names', () => {
    const detail = mapVaultTransactionDetail(
      dto({
        paidBy: { userId: 1, displayName: 'Cattie', avatarUrl: null },
        madeBy: { userId: 2, displayName: 'Nam', avatarUrl: 'https://x/y.png' },
      }),
    );
    expect(detail.paidByName).toBe('Cattie');
    expect(detail.madeByName).toBe('Nam');
    expect(detail.madeByAvatarUrl).toBe('https://x/y.png');
  });

  it('falls back OTHER for an unrecognised/absent category', () => {
    expect(mapVaultTransactionDetail(dto()).category).toBe('OTHER');
  });

  it('carries canApprove/canCancel/canEdit/needsApproval through unchanged', () => {
    const detail = mapVaultTransactionDetail(
      dto({ canApprove: true, canCancel: true, canEdit: false, needsApproval: true }),
    );
    expect(detail).toMatchObject({
      canApprove: true,
      canCancel: true,
      canEdit: false,
      needsApproval: true,
    });
  });
});
