/**
 * Data-driven settings sections/rows — port of `SettingView.sections` (SettingView.swift:44).
 * `titleKey` is the i18n source string (pass straight to `t()`). `adPrivacy` is rendered separately by SettingsScreen when UMP requires it.
 */
import type { Ionicons } from '@expo/vector-icons';

export type SettingRowId =
  | 'displayName'
  | 'currency'
  | 'language'
  | 'tripTips'
  | 'privacy'
  | 'terms'
  | 'rate'
  | 'support'
  | 'logout'
  | 'delete';

export type IoniconName = keyof typeof Ionicons.glyphMap;

/** `svg.settings` key — kept as a literal union so this module stays free of asset imports. */
export type SettingAssetName =
  | 'displayName'
  | 'currency'
  | 'privacy'
  | 'terms'
  | 'feedback'
  | 'support'
  | 'logout'
  | 'deleteAccount';

/**
 * An Ionicons name, a colored `settingIcon` asset, or an SF Symbol (iOS) with an Ionicons
 * fallback. `symbolSize` is the glyph point size when it differs from the frame.
 */
export type SettingIconSpec =
  | IoniconName
  | { asset: SettingAssetName }
  | { sf: string; ionicon: IoniconName; symbolSize?: number };

export interface SettingRowDef {
  id: SettingRowId;
  icon: SettingIconSpec;
  titleKey: string;
  destructive?: boolean;
  /** Trailing chevron — port of `SettingItem.showsDisclosure` (SettingView.swift:44-130). */
  disclosure?: boolean;
}

export interface SettingSectionDef {
  id: string;
  icon: SettingIconSpec;
  titleKey: string;
  rows: readonly SettingRowDef[];
}

export const SETTING_SECTIONS: readonly SettingSectionDef[] = [
  {
    id: 'personal',
    icon: { sf: 'person.crop.circle.fill', ionicon: 'person-circle', symbolSize: 12 },
    titleKey: 'Personal',
    rows: [
      { id: 'displayName', icon: { asset: 'displayName' }, titleKey: 'Display name' },
      { id: 'currency', icon: { asset: 'currency' }, titleKey: 'Currency', disclosure: true },
      {
        id: 'language',
        icon: { sf: 'globe', ionicon: 'globe-outline', symbolSize: 18 },
        titleKey: 'Language',
        disclosure: true,
      },
      {
        id: 'tripTips',
        icon: { sf: 'bell.badge.fill', ionicon: 'notifications', symbolSize: 18 },
        titleKey: 'Trip tips & nudges',
      },
    ],
  },
  {
    id: 'oneplan',
    icon: { sf: 'creditcard.fill', ionicon: 'card', symbolSize: 12 },
    titleKey: 'One Plan',
    rows: [
      {
        id: 'privacy',
        icon: { asset: 'privacy' },
        titleKey: 'Privacy Policy',
        disclosure: true,
      },
      {
        id: 'terms',
        icon: { asset: 'terms' },
        titleKey: 'Terms and Conditions',
        disclosure: true,
      },
    ],
  },
  {
    id: 'about',
    icon: { sf: 'wineglass.fill', ionicon: 'wine', symbolSize: 12 },
    titleKey: 'About us',
    rows: [
      {
        id: 'rate',
        icon: { asset: 'feedback' },
        titleKey: 'Rate your experiences',
        disclosure: true,
      },
      {
        id: 'support',
        icon: { asset: 'support' },
        titleKey: 'Contact support',
        disclosure: true,
      },
    ],
  },
  {
    id: 'danger',
    icon: { sf: 'exclamationmark.shield.fill', ionicon: 'shield', symbolSize: 12 },
    titleKey: 'Danger zone',
    rows: [
      { id: 'logout', icon: { asset: 'logout' }, titleKey: 'Log out' },
      {
        id: 'delete',
        icon: { asset: 'deleteAccount' },
        titleKey: 'Delete my account',
        destructive: true,
      },
    ],
  },
] as const;

/** External links opened via `Linking.openURL` (`SettingView.swift`'s `privacyPolicyURL` etc). */
export const SETTINGS_URLS = {
  privacy: 'https://oneplan.space/privacy-policy',
  terms: 'https://oneplan.space/termandconditions',
  support: 'https://t.me/+C6MDB5xslyRlZTZl',
} as const;
