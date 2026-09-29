import { api as defaultApi, type ApiClient } from '@/api/client';
import type { components } from '@/api/schema';

import { completeSignIn, type AuthResponseDto } from './session';

export type SocialLoginBody = components['schemas']['SocialLoginDto'];

/** `POST /auth/social` with an Apple/Google identity token, then store the session. */
export async function exchangeSocial(
  body: SocialLoginBody,
  api: ApiClient = defaultApi,
): Promise<AuthResponseDto> {
  const { data, error, response } = await api.POST('/auth/social', { body });
  if (!data) throw new Error(`POST /auth/social ${response.status}: ${JSON.stringify(error)}`);
  await completeSignIn(data);
  return data;
}
