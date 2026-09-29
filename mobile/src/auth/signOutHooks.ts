/**
 * Best-effort work that must run before the session is torn down, e.g. the push
 * module unregistering its device token (`DELETE /devices/token`) while the
 * access token is still valid. Modules register themselves so `session.ts`
 * never has to import them (keeps `@/auth` free of `@/push` dependencies).
 */
export type SignOutHook = () => Promise<void>;

const hooks = new Set<SignOutHook>();

/** Registers `fn` to run at the start of `signOutEverywhere()`. Returns an unregister function. */
export function registerSignOutHook(fn: SignOutHook): () => void {
  hooks.add(fn);
  return () => {
    hooks.delete(fn);
  };
}

/** Runs every hook concurrently; failures are swallowed so sign-out always proceeds. */
export async function runSignOutHooks(): Promise<void> {
  await Promise.allSettled(
    [...hooks].map(async (hook) => {
      await hook();
    }),
  );
}

/** Test-only. */
export function _resetSignOutHooksForTests(): void {
  hooks.clear();
}
