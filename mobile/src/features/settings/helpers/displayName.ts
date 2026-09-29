/**
 * Port of `SettingView.commitDisplayNameEditIfNeeded` (SettingView.swift:609). Trims both the
 * original and the edited value, then decides whether the edit is worth a `PATCH /auth/me` —
 * a no-op when the trimmed edit is empty or identical to the trimmed original.
 */
export type CommitDisplayNameResult = { commit: false } | { commit: true; value: string };

export function commitDisplayName(original: string, edited: string): CommitDisplayNameResult {
  const normalizedEdited = edited.trim();
  const normalizedOriginal = original.trim();

  if (normalizedEdited.length === 0) return { commit: false };
  if (normalizedEdited === normalizedOriginal) return { commit: false };

  return { commit: true, value: normalizedEdited };
}
