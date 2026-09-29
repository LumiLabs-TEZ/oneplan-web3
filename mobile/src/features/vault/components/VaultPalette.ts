/**
 * Colours the vault screens use that `theme.ts` does not carry — port of
 * `ios/OnePlan/OnePlan/Component/Vault/VaultPalette.swift`.
 *
 * Each is sampled from the design render rather than read off a token,
 * because the design draws these with Apple's Liquid Glass, which lightens
 * whatever tint it is given — so the value here is not what iOS's glass
 * chrome shows on screen; RN has no Liquid Glass, so these are drawn flat.
 */
export const VaultPalette = {
  /** The primary action blue: Scan QR on the card, Done on the expense sheet. */
  accent: 'rgb(72, 184, 254)',

  /** The scanner's viewfinder frame. */
  scanFrame: 'rgb(255, 183, 0)',

  /**
   * The header chips.
   *
   * Translucent rather than a fixed grey — the design declares it that way
   * because it makes one value work on two backdrops: over the flat page it
   * composites to #F5F5F5, and over the receipt's gradient to #CFE1EA.
   */
  headerChip: 'rgba(213, 213, 213, 0.35)',
} as const;
