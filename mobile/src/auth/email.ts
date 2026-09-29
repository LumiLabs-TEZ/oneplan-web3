import { api as defaultApi, type ApiClient } from '@/api/client';
import { isProd } from '@/lib/env';

import { completeSignIn, type AuthResponseDto } from './session';

/**
 * Email/password auth exists only for simulators and local servers (the shipped
 * app is social-only, so there is no UI to reach these). Hard-disabled in prod.
 */
function assertNotProd(): void {
  if (isProd) throw new Error('email sign-in is dev/local only');
}

export async function signInWithEmail(
  email: string,
  password: string,
  api: ApiClient = defaultApi,
): Promise<AuthResponseDto> {
  assertNotProd();
  const { data, error, response } = await api.POST('/auth/login', { body: { email, password } });
  if (!data) throw new Error(`POST /auth/login ${response.status}: ${JSON.stringify(error)}`);
  await completeSignIn(data);
  return data;
}

export async function registerWithEmail(
  email: string,
  password: string,
  displayName: string,
  api: ApiClient = defaultApi,
): Promise<AuthResponseDto> {
  assertNotProd();
  const { data, error, response } = await api.POST('/auth/register', {
    body: { email, password, displayName },
  });
  if (!data) throw new Error(`POST /auth/register ${response.status}: ${JSON.stringify(error)}`);
  await completeSignIn(data);
  return data;
}
