/**
 * Server build commit for the version footer — port of `SettingView.fetchServerCommitHash`
 * (SettingView.swift:645). Raw `fetch` (not the generated client — `/health/live` is
 * unauthenticated infra, not part of the OpenAPI-documented surface) with a 5s timeout;
 * `staleTime: Infinity` + `retry: 0` mean this only ever runs once per app session — a `--`
 * commit isn't worth retrying for.
 */
import { useQuery } from '@tanstack/react-query';

import { keys } from '@/api/keys';
import { env } from '@/lib/env';

import { shortCommit } from './helpers/serverCommit';

interface ServerLiveResponse {
  commitHash?: string | null;
}

export async function fetchServerCommitHash(): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${env.apiUrl}/health/live`, { signal: controller.signal });
    if (!response.ok) return null;
    const data = (await response.json()) as ServerLiveResponse;
    return data.commitHash ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Short (7-char) server commit hash, or `'--'` while loading / on failure. */
export function useServerCommit(): string {
  const query = useQuery({
    queryKey: keys.health,
    queryFn: fetchServerCommitHash,
    staleTime: Infinity,
    retry: 0,
  });
  return shortCommit(query.data);
}
