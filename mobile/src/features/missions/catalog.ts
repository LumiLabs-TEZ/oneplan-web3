export const rewardCatalog = {
  scan_credit_1: {
    title: '+1 scan credit',
    subtitle: 'Turn 1 more video into pins',
    gradient: ['#E2EFFF', '#F9FBFF'] as const,
  },
  market_unlock: {
    title: 'Unlock 1 Market plan',
    subtitle: 'Apply any plan you want',
    gradient: ['#FFF3E2', '#FFFBF6'] as const,
  },
  pro_7d: {
    title: '7 days of Pro',
    subtitle: 'Unlocked for a week',
    gradient: ['#E2FFE2', '#FAFFFA'] as const,
  },
  pro_30d: {
    title: '30 days of Pro',
    subtitle: 'A full month of Pro',
    gradient: ['#FCE2FF', '#FFFAFF'] as const,
  },
};
export type RewardId = keyof typeof rewardCatalog;
export function isRewardId(id: string): id is RewardId {
  return Object.hasOwn(rewardCatalog, id);
}
