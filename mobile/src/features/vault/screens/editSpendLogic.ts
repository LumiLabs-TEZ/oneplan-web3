/**
 * Pure save-time logic for `VaultTransactionEditScreen` — port of the `resolvedName`/
 * `resolvedShareWithUserIds` computed properties in `VaultTransactionEditView.swift`
 * (`origin/feat/web3-version`). Amount is intentionally not part of this module at all: the
 * on-chain transfer already happened, so there is nothing here to validate or resolve for it —
 * the PATCH body (`UpdateVaultSpendDto`) has no amount field to begin with.
 */

/** An empty/whitespace-only typed name falls back to the category's own title. */
export function resolvedSpendName(typedName: string, categoryTitle: string): string {
  const trimmed = typedName.trim();
  return trimmed === '' ? categoryTitle : trimmed;
}

/** Empty means shared with everyone — `isSharedWithAll` wins regardless of a stale id set. */
export function resolvedShareWithUserIds(
  isSharedWithAll: boolean,
  shareWithUserIds: ReadonlySet<number>,
): number[] {
  return isSharedWithAll ? [] : Array.from(shareWithUserIds);
}
