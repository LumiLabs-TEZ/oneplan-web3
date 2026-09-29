import { api as defaultApi, type ApiClient } from '@/api/client';
import { mutationResult } from './mutations';
export async function reportAppLaunch(appVersion: string, api: ApiClient = defaultApi) {
  return mutationResult(await api.POST('/scan-credit/app-launch', { body: { appVersion } }));
}
/** One ad view, one key. Only network/5xx failures warrant a retry. */
export async function claimRewardedCredit(adKey: string, api: ApiClient = defaultApi) {
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await api.POST('/scan-credit/rewarded-ad', { body: { adKey } });
      if (result.response.status >= 500 && attempt === 0) continue;
      return mutationResult(result);
    } catch (error) {
      if (attempt === 0 && error instanceof TypeError) continue;
      throw error;
    }
  }
}
