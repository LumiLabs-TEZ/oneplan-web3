import { firstOpenInviteKey, shouldShowFirstOpenInvite } from './firstOpenInvite';

const base = { online: true, inviteCode: 'abc123', alreadyShown: false };

describe('shouldShowFirstOpenInvite', () => {
  it('presents for any online member with an invite code that has not been shown', () => {
    expect(shouldShowFirstOpenInvite(base)).toBe(true);
  });

  it('never presents when offline, already shown, or the trip has no invite code', () => {
    expect(shouldShowFirstOpenInvite({ ...base, online: false })).toBe(false);
    expect(shouldShowFirstOpenInvite({ ...base, alreadyShown: true })).toBe(false);
    expect(shouldShowFirstOpenInvite({ ...base, inviteCode: '' })).toBe(false);
    expect(shouldShowFirstOpenInvite({ ...base, inviteCode: null })).toBe(false);
    expect(shouldShowFirstOpenInvite({ ...base, inviteCode: undefined })).toBe(false);
  });
});

describe('firstOpenInviteKey', () => {
  it('is per trip', () => {
    expect(firstOpenInviteKey(12)).toBe('tripInviteSheetShown.12');
  });
});
