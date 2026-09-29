import type { RefObject } from 'react';
import type { View } from 'react-native';

import type { GlassBackdropContextValue } from '@/ui/components/GlassBackdrop';

/**
 * Backdrop for a tab scene's glass. Only the focused tab samples it: on Android every sampling
 * `BlurView` (Dimezis) re-captures and blurs its full-screen target on each frame, visible or
 * not, and inactive scenes stay attached (`detachInactiveScreens={false}`) — so letting hidden
 * tabs' headers keep their backdrop stacks one full-screen blur per capsule per visited tab.
 * Unfocused glass falls back to `AndroidGlass`'s translucent fill (iOS never samples it).
 */
export function tabBackdrop(
  ref: RefObject<View | null> | undefined,
  attached: boolean,
  focused: boolean,
): GlassBackdropContextValue | undefined {
  return ref ? { ref, ready: attached && focused } : undefined;
}
