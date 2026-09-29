// One reward-shop card's static presentation (Figma "Redeem gifts", node
// 4388:23947). Prices come from the server (`GET /missions` shop state) so
// design-time numbers never drift from the ledger; everything else — copy,
// artwork, gradient — is a fixed per-item design decision.
// Ported from `RewardShopItem` in ios OnePlan/Component/Missions/RewardShopSection.swift.

export interface RewardShopItem {
  /** Server itemId: scan_credit_1 | market_unlock | pro_7d | pro_30d */
  id: string;
  price: number;
  title: string;
  subtitle: string;
  /** Artwork asset name (matches the iOS asset catalog name). */
  assetName: string;
  /** Hex colour, e.g. "#E2EFFF". */
  gradientTop: string;
  gradientBottom: string;
  /** False when a quarter-capped item is exhausted — card renders dimmed. */
  isAvailable: boolean;
}

export interface RewardShopCatalogInputs {
  id: string;
  price: number;
  isAvailable?: boolean;
}

interface RewardShopDesign {
  /** i18n key == English source text. */
  title: string;
  subtitle: string;
  assetName: string;
  gradientTop: string;
  gradientBottom: string;
}

const DESIGNS: Record<string, RewardShopDesign> = {
  scan_credit_1: {
    title: '+1 scan credit',
    subtitle: 'Turn 1 more video into pins',
    assetName: 'rewardScanCredit',
    gradientTop: '#E2EFFF',
    gradientBottom: '#F9FBFF',
  },
  market_unlock: {
    title: 'Unlock 1 Market plan',
    subtitle: 'Apply any plan you want',
    assetName: 'rewardMarketUnlock',
    gradientTop: '#FFF3E2',
    gradientBottom: '#FFFBF6',
  },
  pro_7d: {
    title: '7 days of Pro',
    subtitle: 'Unlocked for a week',
    assetName: 'rewardPro7d',
    gradientTop: '#E2FFE2',
    gradientBottom: '#FAFFFA',
  },
  pro_30d: {
    title: '30 days of Pro',
    subtitle: 'A full month of Pro',
    assetName: 'rewardPro30d',
    gradientTop: '#FCE2FF',
    gradientBottom: '#FFFAFF',
  },
};

const identity = (key: string): string => key;

/**
 * Maps a server shop item onto its card design. Returns `undefined` for ids
 * without a design so unknown items are dropped rather than rendered blank.
 *
 * @param t translator applied to the copy keys (e.g. `i18next.t`); defaults to identity.
 */
export function rewardShopCatalog(
  { id, price, isAvailable = true }: RewardShopCatalogInputs,
  t: (key: string) => string = identity,
): RewardShopItem | undefined {
  const design = DESIGNS[id];
  if (!design) return undefined;
  return {
    id,
    price,
    title: t(design.title),
    subtitle: t(design.subtitle),
    assetName: design.assetName,
    gradientTop: design.gradientTop,
    gradientBottom: design.gradientBottom,
    isAvailable,
  };
}
