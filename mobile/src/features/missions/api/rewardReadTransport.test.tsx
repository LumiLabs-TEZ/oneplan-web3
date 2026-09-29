import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api, type ApiClient } from '@/api/client';
import { useScanCredits } from '@/features/board/api/queries';
import { useIsPro } from '@/features/subscription/api/queries';

jest.mock('@/auth/authStore', () => ({
  useAuthStore: (selector: (state: { status: string }) => unknown) =>
    selector({ status: 'authed' }),
}));
jest.mock('@/api/client', () => ({
  api: {
    GET: jest.fn(() => {
      throw new Error('Fixture escaped to live API');
    }),
  },
}));

it('keeps reward credit and entitlement refetches on the supplied transport after invalidation', async () => {
  const get = jest.fn(async (path: string) => ({
    data: path === '/subscription/status' ? { tier: 'pro_monthly' } : { available: 4 },
    response: { ok: true },
  }));
  const transport = { GET: get } as unknown as ApiClient;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  const { result, unmount } = await renderHook(
    () => ({
      credits: useScanCredits({ transport }),
      pro: useIsPro(transport),
    }),
    { wrapper: Wrapper },
  );
  await waitFor(() => {
    expect(result.current.credits.data?.available).toBe(4);
    expect(result.current.pro).toBe(true);
  });
  await act(async () => {
    await client.invalidateQueries();
  });
  expect(get.mock.calls.map(([path]) => path)).toEqual([
    '/board/pins/extract/quota',
    '/subscription/status',
    '/board/pins/extract/quota',
    '/subscription/status',
  ]);
  expect(api.GET).not.toHaveBeenCalled();
  await unmount();
  client.clear();
});
