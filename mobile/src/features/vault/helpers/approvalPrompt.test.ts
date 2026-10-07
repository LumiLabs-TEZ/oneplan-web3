import type { VaultApprovalRequest } from '@/realtime/realtimeStore';

import { shouldPromptApproval } from './approvalPrompt';

const base: VaultApprovalRequest = {
  tripId: 7,
  vaultTransactionId: 42,
  amountVnd: '200000',
  recipientName: 'NGUYEN VAN A',
  proposedByUserId: 1,
  approverUserIds: null,
};

describe('shouldPromptApproval', () => {
  it('prompts another member when any member may approve', () => {
    expect(shouldPromptApproval(base, 7, 2)).toBe(true);
  });

  it('never prompts the proposer', () => {
    expect(shouldPromptApproval(base, 7, 1)).toBe(false);
  });

  it('only prompts named approvers', () => {
    const named = { ...base, approverUserIds: [3] };
    expect(shouldPromptApproval(named, 7, 2)).toBe(false);
    expect(shouldPromptApproval(named, 7, 3)).toBe(true);
  });

  it('ignores another trip and an unknown user', () => {
    expect(shouldPromptApproval(base, 8, 2)).toBe(false);
    expect(shouldPromptApproval(base, 7, undefined)).toBe(false);
  });
});
