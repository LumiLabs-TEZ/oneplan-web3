import { createContext, useContext } from 'react';
import { api, type ApiClient } from '@/api/client';
/** Production defaults to the authenticated API. Reference harnesses supply an isolated fake. */
export const MissionsTransport = createContext<ApiClient>(api);
export function useMissionsTransport() {
  return useContext(MissionsTransport);
}
