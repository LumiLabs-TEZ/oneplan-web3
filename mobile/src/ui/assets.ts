/**
 * Single import point for bundled images. SVGs (from the iOS asset catalog) are
 * React components via react-native-svg-transformer; PNGs are `ImageSourcePropType`.
 * iOS SVGs that only wrap a base64 PNG are shipped as rendered PNGs behind the same component
 * shape (`rasterIllustration`) — see `RasterIllustration.tsx` for why.
 */
import type { ImageSourcePropType } from 'react-native';

import type { components } from '@/api/schema';

import CategoryChipBuilding from '@/assets/images/categoryIcon/darkBuildingIcon.svg';
import CategoryChipFood from '@/assets/images/categoryIcon/darkFoodIcon.svg';
import CategoryChipPlane from '@/assets/images/categoryIcon/darkPlaneIcon.svg';
import CategoryChipTicket from '@/assets/images/categoryIcon/darkTicketIcon.svg';
import ClockIcon from '@/assets/images/icons/clockIcon.svg';
import GoogleIcon from '@/assets/images/icons/google.svg';
import GoogleMapsIcon from '@/assets/images/icons/googleMaps.svg';
import MarketClockIcon from '@/assets/images/market/marketClockIcon.svg';
import MarketFriendIcon from '@/assets/images/market/marketFriendIcon.svg';
import DollarSignCircleIcon from '@/assets/images/market/dollarSignCircleIcon.svg';
import AppLogo from '@/assets/images/illustration/appLogo.svg';
import AppLogoCutout from '@/assets/images/illustration/appLogoCutout.svg';
import AppLogoDark from '@/assets/images/illustration/appLogoDark.svg';
import OnePlanPro from '@/assets/images/illustration/onePlanPro.svg';
import SettingDisplayName from '@/assets/images/settings/settingDisplayName.svg';
import SettingCurrency from '@/assets/images/settings/settingCurrency.svg';
import SettingPrivacyPolicy from '@/assets/images/settings/settingPrivacyPolicy.svg';
import SettingTerms from '@/assets/images/settings/settingTerms.svg';
import SettingFeedback from '@/assets/images/settings/settingFeedback.svg';
import SettingSupport from '@/assets/images/settings/settingSupport.svg';
import SettingLogout from '@/assets/images/settings/settingLogout.svg';
import SettingDeleteAccount from '@/assets/images/settings/settingDeleteAccount.svg';
import TabBoard from '@/assets/images/tab/board.svg';
import TabBoardBlue from '@/assets/images/tab/boardBlue.svg';
import TabHome from '@/assets/images/tab/home.svg';
import TabHomeBlue from '@/assets/images/tab/homeBlue.svg';
import TabPlanet from '@/assets/images/tab/planet.svg';
import TabPlanetBlue from '@/assets/images/tab/planetBlue.svg';
import TabSuitcase from '@/assets/images/tab/suitcase.svg';
import TabSuitcaseBlue from '@/assets/images/tab/suitcaseBlue.svg';
import VaultLeaveBackArrow from '@/assets/images/vault/vaultLeaveBackArrow.svg';
import VaultDepositOptionWallet from '@/assets/images/vault/depositOptionWallet.svg';
import VaultWalletIcon from '@/assets/images/vault/walletIcon.svg';
import { rasterIllustration } from '@/ui/components/RasterIllustration';

const AvatarPlaceholder = rasterIllustration(
  require('@/assets/images/avatarPlaceholder.png') as number,
  { width: 173, height: 173 },
);
const EmptyHome = rasterIllustration(
  require('@/assets/images/illustration/emptyHome.png') as number,
  { width: 186, height: 220 },
);
const EmptyBoard = rasterIllustration(
  require('@/assets/images/illustration/emptyBoard.png') as number,
  { width: 154, height: 160 },
);
const EmptyFriend = rasterIllustration(
  require('@/assets/images/illustration/emptyFriend.png') as number,
  { width: 186, height: 220 },
);
const EmptyMarket = rasterIllustration(
  require('@/assets/images/illustration/emptyMarket.png') as number,
  { width: 186, height: 220 },
);
const Grocery = rasterIllustration(require('@/assets/images/categories/grocery.png') as number, {
  width: 200,
  height: 200,
});
const Restaurant = rasterIllustration(
  require('@/assets/images/categories/restaurant.png') as number,
  { width: 200, height: 200 },
);
const Museum = rasterIllustration(require('@/assets/images/categories/museum.png') as number, {
  width: 200,
  height: 200,
});
const Medical = rasterIllustration(require('@/assets/images/categories/medical.png') as number, {
  width: 200,
  height: 200,
});
const Others = rasterIllustration(require('@/assets/images/categories/others.png') as number, {
  width: 200,
  height: 200,
});
const Coffee = rasterIllustration(require('@/assets/images/categories/coffee.png') as number, {
  width: 200,
  height: 200,
});
const Park = rasterIllustration(require('@/assets/images/categories/park.png') as number, {
  width: 200,
  height: 200,
});
const Hotel = rasterIllustration(require('@/assets/images/categories/hotel.png') as number, {
  width: 200,
  height: 200,
});
const Gym = rasterIllustration(require('@/assets/images/categories/gym.png') as number, {
  width: 200,
  height: 200,
});
const Shopping = rasterIllustration(require('@/assets/images/categories/shopping.png') as number, {
  width: 200,
  height: 200,
});
const Spa = rasterIllustration(require('@/assets/images/categories/spa.png') as number, {
  width: 200,
  height: 200,
});
const Cinema = rasterIllustration(require('@/assets/images/categories/cinema.png') as number, {
  width: 200,
  height: 200,
});
const NightClub = rasterIllustration(
  require('@/assets/images/categories/night-club.png') as number,
  { width: 200, height: 200 },
);
const Airport = rasterIllustration(require('@/assets/images/categories/airport.png') as number, {
  width: 200,
  height: 200,
});
const VaultLeaveReceivedCheck = rasterIllustration(
  require('@/assets/images/vault/vaultLeaveReceivedCheck.png') as number,
  { width: 19, height: 19 },
);
const VaultLeaveWaitingCheck = rasterIllustration(
  require('@/assets/images/vault/vaultLeaveWaitingCheck.png') as number,
  { width: 19, height: 19 },
);

export type ExpenseCategory = components['schemas']['ExpenseCategory'];

export const svg = {
  tab: {
    home: TabHome,
    homeBlue: TabHomeBlue,
    planet: TabPlanet,
    planetBlue: TabPlanetBlue,
    board: TabBoard,
    boardBlue: TabBoardBlue,
    suitcase: TabSuitcase,
    suitcaseBlue: TabSuitcaseBlue,
  },
  icons: { clock: ClockIcon, google: GoogleIcon, googleMaps: GoogleMapsIcon },
  /** `MarketplaceFilterChip` leading icons (`MarketplaceFilterStrip.swift:17-35`). */
  marketFilterIcons: {
    duration: MarketClockIcon,
    companions: MarketFriendIcon,
    budget: DollarSignCircleIcon,
  },
  illustration: {
    appLogo: AppLogo,
    appLogoDark: AppLogoDark,
    appLogoCutout: AppLogoCutout,
    onePlanPro: OnePlanPro,
    emptyHome: EmptyHome,
    emptyBoard: EmptyBoard,
    emptyFriend: EmptyFriend,
    emptyMarket: EmptyMarket,
  },
  /** `Assets.xcassets/settingIcon` — colored Settings row icons. */
  settings: {
    displayName: SettingDisplayName,
    /** `Assets.xcassets/vault/walletIcon` — reused from the vault asset set for the "My wallet" row. */
    wallet: VaultWalletIcon,
    currency: SettingCurrency,
    privacy: SettingPrivacyPolicy,
    terms: SettingTerms,
    feedback: SettingFeedback,
    support: SettingSupport,
    logout: SettingLogout,
    deleteAccount: SettingDeleteAccount,
  },
  avatarPlaceholder: AvatarPlaceholder,
  /**
   * `Assets.xcassets/vault` — personal-wallet chrome (`OnePlanWalletCard`, Settings "My wallet")
   * plus `Assets.xcassets/vaultLeave*`: `leaveBackArrow` is the leave sheets' rotated "Back"
   * chevron; `leaveReceivedCheck`/`leaveWaitingCheck` are the host sheet's status pill icons
   * (rasterized like `avatarPlaceholder` above, not true SVGs, but consumed the same way).
   */
  vault: {
    depositOptionWallet: VaultDepositOptionWallet,
    walletIcon: VaultWalletIcon,
    leaveBackArrow: VaultLeaveBackArrow,
    leaveReceivedCheck: VaultLeaveReceivedCheck,
    leaveWaitingCheck: VaultLeaveWaitingCheck,
  },
  /**
   * `Assets.xcassets/categoryIcon/dark*Icon` — 16pt glyphs `CategoryChip.Category.iconSource`
   * uses for the four categories that aren't SF Symbols (`CategoryChip.swift:46-56`).
   */
  categoryChip: {
    food: CategoryChipFood,
    building: CategoryChipBuilding,
    ticket: CategoryChipTicket,
    plane: CategoryChipPlane,
  },
  /** iOS `ExpenseCategoryOption.imageName` → `Assets.xcassets/poiIllustration`. */
  categories: {
    FOOD: Restaurant,
    STAY: Hotel,
    TICKET: Museum,
    TRANSPORT: Airport,
    OTHER: Others,
    COFFEE: Coffee,
    SPA: Spa,
    GYM: Gym,
    NIGHT_CLUB: NightClub,
    GROCERY: Grocery,
    SHOPPING: Shopping,
    CINEMA: Cinema,
    PHARMACY: Medical,
    PARK: Park,
  } satisfies Record<ExpenseCategory, unknown>,
} as const;

export const images = {
  /**
   * `appLogoCutout` as a white silhouette in a 120pt rounded frame (@3x). Shared by the native
   * launch screen (`expo-splash-screen` in app.config.ts) and `AnimatedSplash`, so the handoff
   * between them is pixel-identical. A module id, as Skia's `useImage` expects.
   */
  splashLogo: require('@/assets/images/splash-logo.png') as number,
  /** iOS asset-catalog `appleMap` (1024×512, centre-cropped square when drawn). */
  appleMap: require('@/assets/images/icons/appleMap.png') as ImageSourcePropType,
  illustration: {
    updateRequiredCharacter:
      require('@/assets/images/illustration/updateRequiredCharacter.png') as ImageSourcePropType,
  },
  /** `Assets.xcassets/background/friendProfileHeaderBackground` — universal-only PNG. */
  friends: {
    profileHeaderBackground:
      require('@/assets/images/friends/friendProfileHeaderBackground.png') as ImageSourcePropType,
    /**
     * `Assets.xcassets/background/inviteBackground` — the iOS asset is an SVG wrapper whose only
     * content is a 1152×2048 embedded PNG plus a light overlay gradient; the PNG is extracted
     * here (the receive modal re-applies the gradient with `LinearGradient`). iOS draws it
     * vertically mirrored (`transform: matrix(1 0 0 -1 …)`), so consumers flip it.
     */
    inviteBackground:
      require('@/assets/images/friends/inviteBackground.png') as ImageSourcePropType,
  },
  /**
   * `Assets.xcassets/background/cardBackground` — the iOS SVG wraps a sky raster drawn
   * vertically mirrored under a #F7F7F7→clear fade; flattened here at 3× (1107×909, i.e. the
   * 369×303 artboard) so `HomeCard` can draw it as a plain top-aligned cover image.
   */
  trip: {
    cardBackground: require('@/assets/images/trip/cardBackground.png') as ImageSourcePropType,
    /** `Assets.xcassets/placeholder/defaultTripPlaceholder` — cover fallback (shared market PNG). */
    defaultTripPlaceholder:
      require('@/assets/images/market/defaultTripPlaceholder.png') as ImageSourcePropType,
  },
  /** `Assets.xcassets/passport` — universal-only PNGs (no @2x/@3x), so used at their native size. */
  passport: {
    shareInstagram:
      require('@/assets/images/passport/shareInstagramIcon.png') as ImageSourcePropType,
    shareMessage: require('@/assets/images/passport/shareMessageIcon.png') as ImageSourcePropType,
    sharePhotos: require('@/assets/images/passport/sharePhotosIcon.png') as ImageSourcePropType,
  },
  onboarding: {
    'welcome-to-oneplan': require('@/assets/images/onboarding/welcome-to-oneplan.png'),
    'track-group-expense': require('@/assets/images/onboarding/track-group-expense.png'),
    'plan-your-trip': require('@/assets/images/onboarding/plan-your-trip.png'),
    'board-extract-video': require('@/assets/images/onboarding/board-extract-video.png'),
    'explore-plan-market': require('@/assets/images/onboarding/explore-plan-market.png'),
    'scan-bills-ai': require('@/assets/images/onboarding/scan-bills-ai.png'),
    'settle-with-ease': require('@/assets/images/onboarding/settle-with-ease.png'),
  } satisfies Record<string, ImageSourcePropType>,
  /** `Assets.xcassets/vault` — deposit/settlement have no real category, and the two personal-wallet
   *  history kinds (`OnePlanWalletHistoryRow`). The vault history's deposit row reuses
   *  `walletHistoryDeposit` — the Xcode catalog's `catDeposit` was a byte-identical copy. */
  vault: {
    walletHistoryDeposit:
      require('@/assets/images/vault/walletHistoryDeposit.png') as ImageSourcePropType,
    walletHistoryWithdraw:
      require('@/assets/images/vault/walletHistoryWithdraw.png') as ImageSourcePropType,
  },
} as const;

export const video = {
  login: require('@/assets/video/login.mp4') as number,
} as const;
