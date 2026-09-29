import { resolveRootRoute } from './gate';

describe('resolveRootRoute', () => {
  it.each([
    [false, 'anon', 'onboarding'],
    [false, 'authed', 'onboarding'],
    [true, 'anon', 'login'],
    [true, 'expired', 'login'],
    [true, 'authed', 'app'],
  ] as const)('hasSeenOnboarding=%s status=%s → %s', (hasSeenOnboarding, status, expected) => {
    expect(resolveRootRoute({ hasSeenOnboarding, status })).toBe(expected);
  });
});
