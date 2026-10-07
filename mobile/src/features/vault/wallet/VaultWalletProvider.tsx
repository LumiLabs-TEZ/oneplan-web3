/**
 * Root wallet seam. Android signs with the member's own wallet app over Mobile Wallet Adapter
 * while the server's `GET /web3/eligibility` `mwaEnabled` is on (`WEB3_MWA_ENABLED`), otherwise —
 * and always on iOS — with the Privy embedded wallet. The server owns the switch so Android can go
 * back to Privy without an app build.
 *
 * The active provider is a SIBLING of `children`, never a wrapper: `children` keeps a fixed slot,
 * so flipping the flag (eligibility arrives after launch) swaps only the provider and never
 * remounts the navigator. Neither provider supplies React context — both publish their handle
 * through `setWalletHandle` — so nothing below needs to sit inside them.
 */
import type { PropsWithChildren } from 'react';

import { useUsesMwa } from '../web3Flag';
import { PrivyVaultProvider } from './PrivyVaultProvider';
import { MwaVaultProvider } from './mwa/MwaVaultProvider';

export function VaultWalletProvider({ children }: PropsWithChildren) {
  const usesMwa = useUsesMwa();
  return (
    <>
      {usesMwa ? <MwaVaultProvider /> : <PrivyVaultProvider />}
      {children}
    </>
  );
}
