import { QueryClient } from '@tanstack/react-query';

const clients = new Set<QueryClient>();

/** Track test-owned clients so the shared teardown can clear them after React unmounts. */
export function createTestQueryClient(config?: ConstructorParameters<typeof QueryClient>[0]) {
  const client = new QueryClient(config);
  clients.add(client);
  return client;
}

export function disposeTestQueryClients(): void {
  const tracked = (
    globalThis as typeof globalThis & {
      __onePlanTrackedQueryClients?: Set<QueryClient>;
    }
  ).__onePlanTrackedQueryClients;
  for (const client of clients) {
    for (const mutation of client.getMutationCache().getAll()) mutation.destroy();
    client.clear();
    tracked?.delete(client);
  }
  clients.clear();
}
