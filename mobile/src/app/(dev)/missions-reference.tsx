import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { setAppLanguage, currentLanguage } from '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import createClient from 'openapi-fetch';
import type { paths } from '@/api/schema';
import { keys } from '@/api/keys';
import MissionsScreen from '@/features/missions/MissionsScreen';
import { MissionsTransport } from '@/features/missions/api/transport';
import fixture from '@/features/missions/fixtures/overview.json';
/** Local-only transport: no reward, event, or balance writes can reach an account. */
export default function MissionsReference() {
  const { scenario = 'normal', language = 'en' } = useLocalSearchParams<{
    scenario?: string;
    language?: string;
  }>();
  return <Reference key={`${scenario}-${language}`} scenario={scenario} language={language} />;
}
function Reference({ scenario, language }: { scenario: string; language: string }) {
  useEffect(() => {
    const previous = currentLanguage();
    setAppLanguage(language === 'vi' ? 'vi' : 'en');
    return () => setAppLanguage(previous);
  }, [language]);
  const [client] = useState(() => {
    const value = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Infinity,
          refetchOnWindowFocus: false,
          refetchOnReconnect: false,
        },
      },
    });
    value.setQueryData(keys.subscription.status, { tier: scenario === 'pro' ? 'pro' : 'free' });
    value.setQueryData(keys.scanCredits.balance, { available: 4 });
    return value;
  });
  const [api] = useState(() => {
    const overview = JSON.parse(JSON.stringify(fixture)) as typeof fixture;
    if (scenario === 'insufficient') overview.balance = 0;
    if (scenario === 'empty') {
      overview.missions = [];
      overview.shopItems = [];
    }
    let overviewCalls = 0;
    let redemptions = 0;
    return createClient<paths>({
      baseUrl: 'https://missions-fixture.invalid',
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        const path = new URL(request.url).pathname;
        let response: unknown = overview;
        let status = 200;
        if (path === '/board/pins/extract/quota') {
          response = { available: 4 };
        } else if (path === '/subscription/status') {
          response = { tier: scenario === 'pro' ? 'pro' : 'free' };
        } else if (path === '/missions' && scenario === 'retry' && overviewCalls++ === 0) {
          status = 503;
          response = { message: 'Fixture unavailable' };
        } else if (path === '/missions/redeem' && scenario === 'partial' && ++redemptions === 2) {
          status = 503;
          response = { message: 'Fixture interrupted' };
        } else if (path === '/missions/redeem') {
          const body = (await request.json()) as { itemId: string };
          const item = overview.shopItems.find((item) => item.itemId === body.itemId);
          if (!item?.available || overview.balance < item.price) {
            status = 402;
            response = { message: 'Insufficient spark' };
          } else {
            overview.balance -= item.price;
            response = { itemId: item.itemId, price: item.price, newBalance: overview.balance };
          }
        } else if (path === '/missions/events')
          response = { awarded: false, balance: overview.balance };
        else if (path !== '/missions') throw new Error(`Unexpected fixture request: ${path}`);
        return new Response(JSON.stringify(response), {
          status,
          headers: { 'content-type': 'application/json' },
        });
      }) as typeof fetch,
    });
  });
  // Own provider so the sheet portal host sits *inside* the harness client and transport; the
  // root provider would render sheet content against the real QueryClient and API.
  return (
    <QueryClientProvider client={client}>
      <MissionsTransport value={api}>
        <BottomSheetModalProvider>
          <MissionsScreen />
        </BottomSheetModalProvider>
      </MissionsTransport>
    </QueryClientProvider>
  );
}
