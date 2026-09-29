/**
 * Port of `VaultTransactionDetail` + `VaultTransactionDetailView.map(_:fallbackName:)`
 * (`origin/feat/web3-version`) — turns the server DTO into the plain value the receipt screen
 * renders. A plain value (not the DTO directly) because several fields need real arithmetic
 * (fee percent, VND fee, parsed date) that the screen shouldn't redo on every render.
 */
import { categoryOption, type ExpenseCategory } from '@/features/expense/categories';

import type { VaultTransactionDetailDto } from '../api/queries';

export type VaultTransactionStatus = 'completed' | 'pending' | 'failed';

export interface VaultTransactionDetail {
  amountVnd: number;
  recipientName: string;
  status: VaultTransactionStatus;
  /** ISO timestamp — the screen formats it for display. */
  createdAt: string;
  bankName: string;
  bankAccountNumber: string;
  /** Fee in VND, derived from `feeMicro` × `rate`. */
  feeVnd: number;
  feePercent: number;
  feeUsdc: number;
  rate: number;
  note: string | null;
  name: string;
  needsApproval: boolean;
  canApprove: boolean;
  canCancel: boolean;
  canEdit: boolean;
  category: ExpenseCategory;
  paidByName: string | null;
  /** Empty means everyone shares — the screen renders "All" for an empty array. */
  shareWithNames: string[];
  /** Prefills the edit screen. Empty means shared with everyone. */
  shareWithUserIds: number[];
  madeByName: string;
  madeByAvatarUrl: string | null;
  qrPayload: string | null;
}

function statusFromDto(status: string): VaultTransactionStatus {
  switch (status) {
    case 'CONFIRMED':
      return 'completed';
    case 'FAILED':
      return 'failed';
    default:
      return 'pending';
  }
}

export function mapVaultTransactionDetail(
  dto: VaultTransactionDetailDto,
  fallbackName = '',
): VaultTransactionDetail {
  const feeMicro = Number(dto.feeMicro) || 0;
  const amountUsdcMicro = Number(dto.amountUsdcMicro) || 0;
  const rate = Number(dto.rate) || 0;
  const feePercent = amountUsdcMicro > 0 ? (feeMicro / amountUsdcMicro) * 100 : 0;

  return {
    amountVnd: Number(dto.amountVnd) || 0,
    recipientName: dto.recipientName,
    status: statusFromDto(dto.status),
    createdAt: dto.createdAt,
    bankName: dto.bankName,
    bankAccountNumber: dto.bankAccountNumber,
    feeVnd: (feeMicro / 1_000_000) * rate,
    feePercent,
    feeUsdc: feeMicro / 1_000_000,
    rate,
    note: dto.note ?? null,
    name: dto.name ?? fallbackName,
    needsApproval: dto.needsApproval,
    canApprove: dto.canApprove,
    canCancel: dto.canCancel,
    canEdit: dto.canEdit,
    category: categoryOption(dto.category).value,
    paidByName: dto.paidBy?.displayName ?? null,
    shareWithNames: dto.shareWith.map((m) => m.displayName),
    shareWithUserIds: dto.shareWith.map((m) => m.userId),
    madeByName: dto.madeBy?.displayName ?? '',
    madeByAvatarUrl: dto.madeBy?.avatarUrl ?? null,
    qrPayload: dto.qrPayload ?? null,
  };
}
