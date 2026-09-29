import { QUICK_ACTIONS, resolveQuickAction } from './quickActions';

describe('quickActions', () => {
  it('lists the three iOS quick actions in order', () => {
    expect(QUICK_ACTIONS.map((a) => a.id)).toEqual(['scanQR', 'newTrip', 'uploadTrip']);
    expect(QUICK_ACTIONS.find((a) => a.id === 'uploadTrip')?.proOnly).toBe(true);
  });

  it('gates uploadTrip behind Pro', () => {
    expect(resolveQuickAction('uploadTrip', { isPro: false, planningTripCount: 0 })).toEqual({
      type: 'paywall',
      reason: 'pro_required',
    });
    expect(resolveQuickAction('uploadTrip', { isPro: true, planningTripCount: 0 })).toEqual({
      type: 'open',
      action: 'uploadTrip',
    });
  });

  it('caps free planning trips at 3', () => {
    expect(resolveQuickAction('newTrip', { isPro: false, planningTripCount: 2 }).type).toBe('open');
    expect(resolveQuickAction('newTrip', { isPro: false, planningTripCount: 3 })).toEqual({
      type: 'paywall',
      reason: 'planning_limit',
    });
    expect(resolveQuickAction('newTrip', { isPro: true, planningTripCount: 9 }).type).toBe('open');
  });

  it('never gates scanQR', () => {
    expect(resolveQuickAction('scanQR', { isPro: false, planningTripCount: 9 }).type).toBe('open');
  });
});
