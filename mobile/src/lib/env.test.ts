/**
 * `showDevSignIn` gates the shared "Dev sign-in (email)" link on the login screen. It must stay
 * visible on local/dev builds, and be hidden on prod and on the hackathon APK (eas.json
 * `build.hackathon.env.HIDE_DEV_SIGN_IN` → app.config.ts `extra.hideDevSignIn`).
 */
const baseExtra = {
  variant: 'dev',
  apiUrl: 'https://api.test',
  linkHosts: [],
  googleIosClientId: 'test-ios-client-id',
  googleWebClientId: 'test-web-client-id',
};

function loadEnv(extra: Record<string, unknown>): typeof import('./env') {
  let mod: typeof import('./env') | undefined;
  jest.isolateModules(() => {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { expoConfig: { extra: { ...baseExtra, ...extra } } },
    }));
    mod = jest.requireActual<typeof import('./env')>('./env');
  });
  return mod!;
}

afterEach(() => {
  jest.dontMock('expo-constants');
});

describe('showDevSignIn', () => {
  it('shows the dev sign-in on a dev build', () => {
    expect(loadEnv({ variant: 'dev' }).showDevSignIn).toBe(true);
  });

  it('shows the dev sign-in on a local build', () => {
    expect(loadEnv({ variant: 'local' }).showDevSignIn).toBe(true);
  });

  it('hides it on prod', () => {
    expect(loadEnv({ variant: 'prod' }).showDevSignIn).toBe(false);
  });

  it('hides it on the hackathon build (dev variant + hideDevSignIn)', () => {
    const { env, showDevSignIn } = loadEnv({ variant: 'dev', hideDevSignIn: true });
    expect(env.hideDevSignIn).toBe(true);
    expect(showDevSignIn).toBe(false);
  });
});
