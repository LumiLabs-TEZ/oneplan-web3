/**
 * The one address shortener for the vault UI: `9RqQ...DzQi` (first 4 + last 4). Strings at or
 * below `unshortenedUpTo` characters are shown whole — 10 by default, 8 for the Figma deposit
 * screens. (Six near-identical copies used to live beside their call sites.)
 */
export function shortenAddress(address: string, unshortenedUpTo = 10): string {
  if (address.length <= unshortenedUpTo) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}
