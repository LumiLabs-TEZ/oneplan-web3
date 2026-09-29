import { env, type AppVariant } from '@/lib/env';

/**
 * Path/scheme constants shared with `parseUrl.ts`. Mirrors
 * `DeepLinkBuilder.swift` / `android/.../scan/DeepLinkBuilder.kt`.
 */
export const CUSTOM_SCHEME = 'oneplan';
export const JOIN_PATH = 'join';
export const FRIEND_PATH = 'friend';
export const LISTING_PATH = 'listing';
export const BOARD_PATH = 'board';
export const BOARD_EXTRACT_SEGMENT = 'extract';

/**
 * Universal-link base for `variant` (`DeepLinkBuilder.swift` `universalBaseURL`).
 * Local builds fall through to dev — Universal Links can't match localhost,
 * but debug builds still need a shareable preview URL.
 */
export function universalBase(variant: AppVariant): string {
  return variant === 'prod' ? 'https://op.oneplan.space' : 'https://dev-op.oneplan.space';
}

function universalUrl(variant: AppVariant, segment: string, value: string): string {
  return `${universalBase(variant)}/${segment}/${encodeURIComponent(value)}`;
}

export function tripUrl(code: string, variant: AppVariant = env.variant): string {
  return universalUrl(variant, JOIN_PATH, code);
}

export function friendUrl(code: string, variant: AppVariant = env.variant): string {
  return universalUrl(variant, FRIEND_PATH, code);
}

export function listingUrl(id: number | string, variant: AppVariant = env.variant): string {
  return universalUrl(variant, LISTING_PATH, String(id));
}

/** `oneplan://join/{code}` — the in-app share sheet's custom-scheme fallback. */
export function customSchemeJoin(code: string): string {
  return `${CUSTOM_SCHEME}://${JOIN_PATH}/${encodeURIComponent(code)}`;
}
