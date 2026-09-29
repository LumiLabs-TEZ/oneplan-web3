/**
 * Captures a native view ref to a PNG file URI. Port of `PassportShareService.renderCardImage`
 * (SwiftUI `ImageRenderer`, `.scale = 3`, `.frame(width: 360)`) using `react-native-view-shot`.
 *
 * `react-native-view-shot`'s `CaptureOptions`
 * (node_modules/react-native-view-shot/lib/index.d.ts) has no `scale`/`pixelRatio` knob — only
 * `width`/`height` (the *output* pixel size, resized from the view bounds). `pixelRatio` is kept
 * on this function's options for API parity with the iOS 3x-scale render, but isn't forwarded to
 * `captureRef` since the library has nothing to forward it to.
 */
import type { RefObject } from 'react';
import { captureRef } from 'react-native-view-shot';

export interface CaptureViewOptions {
  width: number;
  pixelRatio: number;
}

/**
 * Resolves to a `file://` URI. Throws `Error('Could not render the passport image')` — the
 * message is the i18n key (English source string); callers wrap it with `t()` before displaying.
 */
export async function captureView(
  ref: RefObject<unknown> | number,
  options: CaptureViewOptions,
): Promise<string> {
  let uri: string;
  try {
    uri = await captureRef(ref as never, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
      width: options.width,
    });
  } catch {
    throw new Error('Could not render the passport image');
  }
  return uri.startsWith('file://') ? uri : `file://${uri}`;
}
