/**
 * Onboarding slides — port of `ios/OnePlan/OnePlan/View/Onboarding/OnboardingItem.swift`.
 * `title`/`subtitle` are i18n keys (English source strings). `zoomScale`/`zoomAnchor`
 * reproduce the per-slide device-frame zoom.
 */
import type { ImageSourcePropType } from 'react-native';

import { images } from '@/ui/assets';

export type ZoomAnchor = 'center' | 'top' | 'bottom';

export interface OnboardingItem {
  id: number;
  title: string;
  subtitle: string;
  image: ImageSourcePropType;
  zoomScale: number;
  zoomAnchor: ZoomAnchor;
}

export const ONBOARDING_ITEMS: readonly OnboardingItem[] = [
  {
    id: 0,
    title: 'Welcome to One Plan',
    subtitle: '',
    image: images.onboarding['welcome-to-oneplan'],
    zoomScale: 1,
    zoomAnchor: 'center',
  },
  {
    id: 1,
    title: 'Track Group Expenses',
    subtitle: 'Keep every shared expense in one place\nand see who paid what, instantly.',
    image: images.onboarding['track-group-expense'],
    zoomScale: 1,
    zoomAnchor: 'center',
  },
  {
    id: 2,
    title: 'Plan Your Trip Together',
    subtitle:
      'Organize destinations, schedules, and trip\ndetails with your group in one smooth flow.',
    image: images.onboarding['plan-your-trip'],
    zoomScale: 1.4,
    zoomAnchor: 'top',
  },
  {
    id: 3,
    title: 'Turn videos into place lists',
    subtitle: 'Saw a viral café or hidden gem? Drop the link and save every place to your Board.',
    image: images.onboarding['board-extract-video'],
    zoomScale: 1.6,
    zoomAnchor: 'top',
  },
  {
    id: 4,
    title: 'Explore Plans on Market',
    subtitle: 'Browse ready-made travel plans from the\ncommunity and apply them in seconds.',
    image: images.onboarding['explore-plan-market'],
    zoomScale: 1,
    zoomAnchor: 'center',
  },
  {
    id: 5,
    title: 'Scan Bills with AI',
    subtitle: 'Snap a receipt and let AI detect items,\ntotals, and split details automatically.',
    image: images.onboarding['scan-bills-ai'],
    zoomScale: 1.2,
    zoomAnchor: 'bottom',
  },
  {
    id: 6,
    title: 'Settle Up with Ease',
    subtitle: 'Wrap up the trip by calculating balances\nand seeing exactly who owes whom.',
    image: images.onboarding['settle-with-ease'],
    zoomScale: 1.4,
    zoomAnchor: 'top',
  },
];
