import { createRef } from 'react';
import type { View } from 'react-native';

import { tabBackdrop } from './tabBackdrop';

describe('tabBackdrop', () => {
  const ref = createRef<View>();

  it('is ready only for the focused, attached tab', () => {
    expect(tabBackdrop(ref, true, true)).toEqual({ ref, ready: true });
  });

  it('withholds the backdrop from unfocused tabs so their blurs unmount', () => {
    expect(tabBackdrop(ref, true, false)).toEqual({ ref, ready: false });
  });

  it('is not ready before the target attaches', () => {
    expect(tabBackdrop(ref, false, true)).toEqual({ ref, ready: false });
  });

  it('is undefined for an unknown route', () => {
    expect(tabBackdrop(undefined, true, true)).toBeUndefined();
  });
});
