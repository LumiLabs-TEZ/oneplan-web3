import { createRef } from 'react';
import { render } from '@testing-library/react-native';
import type { View } from 'react-native';

import { initI18n } from '@/i18n';

import { PassportRenderHost } from './PassportRenderHost';

describe('PassportRenderHost', () => {
  beforeAll(() => {
    initI18n();
  });

  it('renders the render-variant PassportCard off-screen', async () => {
    const hostRef = createRef<View>();
    const screen = await render(<PassportRenderHost summary={null} hostRef={hostRef} />);

    // The `render` variant has no year chips / share row — MRZ + stats should still be present.
    expect(screen.toJSON()).toBeTruthy();
  });

  it('attaches the given ref to the off-screen host view', async () => {
    const hostRef = createRef<View>();
    await render(<PassportRenderHost summary={null} hostRef={hostRef} />);

    expect(hostRef.current).not.toBeNull();
  });
});
