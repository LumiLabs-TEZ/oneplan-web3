import { useMissionsTransport } from './transport';
import {
  onlineManager,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { keys } from '@/api/keys';
import { withTimeout } from '@/api/withTimeout';
import { RedemptionRunner, type ShopRewardId } from '../helpers/redemption';
import { fetchMissions, redeemReward } from './queries';
const runners = new WeakMap<QueryClient, RedemptionRunner>();
export function useRedeem() {
  const client = useQueryClient();
  const transport = useMissionsTransport();
  return useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async ({ itemId, quantity }: { itemId: ShopRewardId; quantity: number }) => {
      let runner = runners.get(client);
      if (!runner) {
        runner = new RedemptionRunner();
        runners.set(client, runner);
      }
      return runner.run(itemId, quantity, {
        online: () => onlineManager.isOnline(),
        // Bounded so a stalled connection can never leave the runner busy for the session.
        overview: async () => {
          const value = await withTimeout((signal) => fetchMissions(transport, signal));
          client.setQueryData(keys.missions, value);
          return value;
        },
        redeem: (body) => withTimeout((signal) => redeemReward(body, transport, signal)),
      });
    },
    onSettled: async () => {
      await Promise.all(
        [keys.missions, keys.scanCredits.balance, keys.subscription.status, keys.market.all].map(
          (queryKey) => client.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
}
