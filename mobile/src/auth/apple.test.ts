/** @jest-environment node */
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

import { buildSocialLoginBody, signInWithApple } from './apple';
import { shouldSignOutForCredentialState } from './appleRevocation';
import { exchangeSocial } from './social';
import { tokenStore } from './tokenStore';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { variant: 'dev', apiUrl: 'http://x', linkHosts: [] } } },
}));
jest.mock('./social', () => ({ exchangeSocial: jest.fn(async () => ({ accessToken: 'a' })) }));

const EMPTY_NAME: AppleAuthentication.AppleAuthenticationFullName = {
  namePrefix: null,
  givenName: null,
  middleName: null,
  familyName: null,
  nameSuffix: null,
  nickname: null,
};

const signInAsync = AppleAuthentication.signInAsync as jest.Mock;
const digest = Crypto.digestStringAsync as jest.Mock;
const randomUUID = Crypto.randomUUID as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  tokenStore._resetForTests();
  randomUUID.mockReturnValue('raw-nonce');
});

describe('signInWithApple', () => {
  it('sends the SHA-256 hashed nonce to Apple and the RAW nonce to the server', async () => {
    signInAsync.mockResolvedValueOnce({
      user: 'apple-user-42',
      identityToken: 'id-token',
      email: 'a@b.c',
      fullName: { givenName: 'Ada', familyName: 'Lovelace' },
    });

    await signInWithApple();

    expect(digest).toHaveBeenCalledWith('SHA-256', 'raw-nonce');
    expect(signInAsync).toHaveBeenCalledWith(
      expect.objectContaining({ nonce: 'sha256(raw-nonce)' }),
    );
    expect(exchangeSocial).toHaveBeenCalledWith({
      identityToken: 'id-token',
      provider: 'APPLE',
      nonce: 'raw-nonce',
      email: 'a@b.c',
      displayName: 'Ada Lovelace',
    });
    expect(tokenStore.getAppleUserId()).toBe('apple-user-42');
  });

  it('throws (and does not hit the server) when Apple returns no identityToken', async () => {
    signInAsync.mockResolvedValueOnce({
      user: 'u',
      identityToken: null,
      email: null,
      fullName: null,
    });
    await expect(signInWithApple()).rejects.toThrow('no identityToken');
    expect(exchangeSocial).not.toHaveBeenCalled();
  });
});

describe('buildSocialLoginBody', () => {
  it('omits email/displayName on returning sign-ins (Apple only sends them once)', () => {
    expect(buildSocialLoginBody({ identityToken: 't', email: null, fullName: null }, 'n')).toEqual({
      identityToken: 't',
      provider: 'APPLE',
      nonce: 'n',
    });
  });

  it('uses whichever name parts are present', () => {
    expect(
      buildSocialLoginBody(
        { identityToken: 't', email: null, fullName: { ...EMPTY_NAME, givenName: 'Ada' } },
        'n',
      ).displayName,
    ).toBe('Ada');
  });
});

describe('shouldSignOutForCredentialState', () => {
  const State = AppleAuthentication.AppleAuthenticationCredentialState;
  it.each([
    [State.REVOKED, true],
    [State.NOT_FOUND, true],
    [State.AUTHORIZED, false],
    [State.TRANSFERRED, false],
  ])('state %p → signOut %p', (state, expected) => {
    expect(shouldSignOutForCredentialState(state)).toBe(expected);
  });
});
