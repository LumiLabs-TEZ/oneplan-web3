import { lastPushedInvite, markInvitePresented, shouldPushInvite } from './presenterState';

afterEach(() => {
  markInvitePresented(null);
});

describe('shouldPushInvite', () => {
  it('pushes only on a transition to a new code', () => {
    expect(shouldPushInvite(null, 'AAA')).toBe(true);
    expect(shouldPushInvite('AAA', 'BBB')).toBe(true);
  });

  it('does not re-push the code already on screen (second websocket invite arriving)', () => {
    expect(shouldPushInvite('AAA', 'AAA')).toBe(false);
  });

  it('never pushes without an active code', () => {
    expect(shouldPushInvite(null, null)).toBe(false);
    expect(shouldPushInvite('AAA', null)).toBe(false);
  });
});

describe('markInvitePresented', () => {
  it('records and clears the presented code', () => {
    markInvitePresented('AAA');
    expect(lastPushedInvite()).toBe('AAA');
    expect(shouldPushInvite(lastPushedInvite(), 'AAA')).toBe(false);
    markInvitePresented(null);
    expect(lastPushedInvite()).toBeNull();
  });
});
