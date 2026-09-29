import { createContext, useContext, type RefObject } from 'react';
import type { View } from 'react-native';

/** The target must contain only the backdrop, never the glass that samples it. */
export interface GlassBackdropContextValue {
  ref: RefObject<View | null>;
  ready: boolean;
}

export const GlassBackdropContext = createContext<GlassBackdropContextValue | undefined>(undefined);
export function useGlassBackdrop() {
  return useContext(GlassBackdropContext);
}
