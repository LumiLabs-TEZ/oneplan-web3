import { resolveInsightTab } from './insightGate';

describe('resolveInsightTab', () => {
  it('allows switching to insight when Pro', () => {
    expect(resolveInsightTab({ requested: 'insight', isPro: true, prevTab: 'history' })).toBe(
      'insight',
    );
  });

  it('reverts to prevTab when requesting insight without Pro', () => {
    expect(resolveInsightTab({ requested: 'insight', isPro: false, prevTab: 'plan' })).toBe('plan');
  });

  it('passes through non-insight requests regardless of Pro status', () => {
    expect(resolveInsightTab({ requested: 'members', isPro: false, prevTab: 'history' })).toBe(
      'members',
    );
    expect(resolveInsightTab({ requested: 'note', isPro: true, prevTab: 'history' })).toBe('note');
  });
});
