/** Source: MissionsSheetView and Redeem{Reward,Success}BottomSheet at 4723846f. */
const nestedHandle = {
  handleStyle: { paddingTop: 5, paddingBottom: 14 },
  handleIndicatorStyle: { width: 36, height: 5 },
};
const nestedChrome = {
  ...nestedHandle,
  stackBehavior: 'push' as const,
  blurBackdrop: false,
  backdropOpacity: 0.12,
};
const nestedGlass = {
  ...nestedChrome,
  material: 'glass' as const,
  backgroundRadius: 48,
  bottomInset: 9,
  detached: true,
  style: { marginHorizontal: 8 },
};
export const sheetPresets = {
  // iOS `.large`: edge-attached, never floating.
  missions: { ...nestedHandle, floating: false, backgroundRadius: 38 },
  // 440 content detent + 14 bottom content inset on the reference runtime.
  rewardRedemption: { ...nestedGlass, snapPoints: [454] },
  // 340 content detent + the same bottom content inset.
  rewardSuccess: { ...nestedGlass, snapPoints: [354] },
  rewardsTerms: { ...nestedChrome, snapPoints: ['94%'] },
  // A category list opened from inside another sheet (vault expense / transaction edit): pushes
  // onto the stack so the parent stays put behind it instead of being minimised (gorhom's default
  // `switch`).
  nestedList: { ...nestedChrome, snapPoints: ['85%'] },
};
export type SheetPreset = keyof typeof sheetPresets;
