import { Logger } from '@nestjs/common';

/**
 * Web3 rejections only: a rate-limited Solana RPC read used to kill the API for
 * every client, twice.
 *
 * Node exits on an unhandled rejection, which is the right default for a server
 * we want restarted, so this is deliberately narrow. It is installed only when
 * the web3 kill switch is on (WEB3_ENABLED=true) — a dark server keeps the
 * stock behaviour — and it swallows only rejections whose stack runs through the
 * Solana client libraries or our vault/solana modules. Everything else is
 * logged and then exits non-zero exactly as Node would, so the container
 * restarts and unrelated bugs stay loud.
 *
 * The swallowed case is logged at ERROR with an ALERT prefix: it is a bug in a
 * missing catch, not a normal event, and should be alerted on. It has no call
 * site in our own stack, so the whole stack is logged. Anything genuinely ours
 * to handle should still be caught where it happens — this is the floor, not
 * the plan. Release-note item: final-review M1 (local audit pack, not in the repo).
 */
const WEB3_STACK_MARKERS = [
  '@solana/',
  '@coral-xyz/',
  'rpc-websockets',
  '/src/solana/',
  '/src/trip-vault/',
  '/src/payout/',
];

export function isWeb3Rejection(reason: unknown): boolean {
  const stack = reason instanceof Error ? (reason.stack ?? '') : '';
  return WEB3_STACK_MARKERS.some((marker) => stack.includes(marker));
}

export function handleUnhandledRejection(
  reason: unknown,
  exit: (code: number) => void = (code) => process.exit(code),
): void {
  const logger = new Logger('UnhandledRejection');
  const text = reason instanceof Error ? reason.stack : String(reason);
  if (isWeb3Rejection(reason)) {
    logger.error(`ALERT swallowed web3 unhandled rejection: ${text}`);
    return;
  }
  logger.error(`unhandled rejection, exiting: ${text}`);
  exit(1);
}

export function scopeUnhandledRejections(): void {
  if (process.env.WEB3_ENABLED !== 'true') {
    return;
  }
  process.on('unhandledRejection', (reason) =>
    handleUnhandledRejection(reason),
  );
}
