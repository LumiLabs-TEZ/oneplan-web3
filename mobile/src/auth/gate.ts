/**
 * Root route decision — mirrors the gate order in `ios/OnePlan/OnePlan/OnePlanApp.swift:62-137`:
 * onboarding until seen, then login until authenticated, then the app.
 */
import type { AuthStatus } from './authStore';

export type RootRoute = 'onboarding' | 'login' | 'app';

export function resolveRootRoute(input: {
  hasSeenOnboarding: boolean;
  status: AuthStatus;
}): RootRoute {
  if (!input.hasSeenOnboarding) return 'onboarding';
  if (input.status !== 'authed') return 'login';
  return 'app';
}
