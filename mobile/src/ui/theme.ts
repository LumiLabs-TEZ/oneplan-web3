/**
 * Design tokens ported from ios/OnePlan/OnePlan/Constants.swift.
 * iOS defines colours as RGB floats; hex values here are the rounded equivalents.
 * `spacing` and `radius` are NEW tokens — the SwiftUI code used inline literals,
 * so screens port with the nearest step.
 */
export const colors = {
  surface: '#FFFFFF',
  onSurface: '#E8E8E8',
  background: '#F7F7F7',
  white: '#FFFFFF',
  black: '#363636',
  secondary: '#E02624',
  contentB: '#363636',
  contentM: '#999999',
  contentL: '#C7C7C7',
  warning500: '#FF591F',
  green100: '#DEF7ED',
  green400: '#30C48C',
  green500: '#0D9E6E',
  blueBase: '#335CFF',
  blueAlpha10: 'rgba(71, 107, 255, 0.10)',
  blueAlpha16: 'rgba(71, 107, 255, 0.16)',
  purple500: '#8F61FA',
  neutral50: '#F7F7F7',
  neutral100: '#E8E8E8',
  neutral200: '#DEDEDE',
  neutral400: '#ADADAD',
  neutral600: '#878787',
  neutral700: '#7A7A7A',
  neutral900: '#545454',
  neutral950: '#363636',
  textSoft400: '#ADADAD',
  dividerStroke: '#F7F7F7',
} as const;

export type ColorToken = keyof typeof colors;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  pill: 999,
} as const;

export const theme = { colors, spacing, radius } as const;
export type Theme = typeof theme;
