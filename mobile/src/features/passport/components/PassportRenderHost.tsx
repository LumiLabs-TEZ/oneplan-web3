import type { RefObject } from 'react';
import { StyleSheet, View } from 'react-native';

import type { PassportSummaryDto } from '@/features/passport/types';

import { PassportCard } from './PassportCard';

export interface PassportRenderHostProps {
  summary: PassportSummaryDto | null;
  hostRef: RefObject<View | null>;
}

/**
 * Off-screen host for the `render`-variant `PassportCard`, captured by `usePassportShare` via
 * `react-native-view-shot`. Port of `PassportShareService.renderCardImage`'s
 * `.frame(width: 360)` + `.environment(\.colorScheme, .light)` — there's no dynamic light/dark
 * palette in this app (`src/ui/theme.ts` has one static palette), so "forced light colours" is a
 * no-op here; only the positioning/sizing needs porting.
 *
 * `collapsable={false}` keeps the native view in the hierarchy for `captureRef` — Android
 * otherwise flattens/GCs views that render nothing visible on screen. Positioned off-screen
 * (`left: -10000`) instead of `opacity: 0`/`display: none` so it still lays out and paints.
 */
export function PassportRenderHost({ summary, hostRef }: PassportRenderHostProps) {
  return (
    <View ref={hostRef} collapsable={false} style={styles.host}>
      <PassportCard summary={summary} variant="render" />
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: -10000, top: 0, width: 360 },
});
