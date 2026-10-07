import * as Joi from 'joi';

/**
 * Solana / web3 settings. Every one is optional so the server always boots:
 * an empty or malformed value turns the feature off (see SolanaService) instead
 * of failing validation or crashing a constructor.
 *
 * `WEB3_ENABLED` is the server-side kill switch. While it is false (the
 * default) the vault, wallet and wallet-token endpoints answer 404, the vault
 * crons do nothing and joinTrip skips vault sync — independent of whether any
 * SOLANA_* secret happens to be set. The program id comes from the IDL, so
 * there is deliberately no SOLANA_PROGRAM_ID.
 */
export const DEFAULT_SOLANA_RPC_URL = 'https://api.devnet.solana.com';
export const DEFAULT_SOLANA_USDC_MINT =
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
export const DEFAULT_SOLANA_COMMITMENT = 'confirmed';

export const solanaConfigSchema = {
  WEB3_ENABLED: Joi.boolean().default(false),
  SOLANA_RPC_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .allow('')
    .default(DEFAULT_SOLANA_RPC_URL),
  SOLANA_USDC_MINT: Joi.string().allow('').default(DEFAULT_SOLANA_USDC_MINT),
  SOLANA_COMMITMENT: Joi.string()
    .valid('processed', 'confirmed', 'finalized')
    .allow('')
    .default(DEFAULT_SOLANA_COMMITMENT),
  SOLANA_FEE_PAYER_SECRET_KEY: Joi.string().allow('').default(''),
  SOLANA_RECEIVER_SECRET_KEY: Joi.string().allow('').default(''),
  /** Owner of the USDC ATA that receives the 0.1% deposit skim. Empty = fee payer. */
  SOLANA_TREASURY_OWNER: Joi.string().allow('').default(''),
  /** Local dev only: country assumed for loopback/private IPs (else not eligible). */
  WEB3_DEV_COUNTRY_OVERRIDE: Joi.string()
    .length(2)
    .uppercase()
    .allow('')
    .default(''),
  MOCK_PAYOUT_OUTCOME: Joi.string()
    .valid('success', 'failed', 'timeout', 'unknown')
    .default('success'),
  /** Per-user withdrawal limits (micro-USDC). */
  WALLET_WITHDRAW_MIN_MICRO: Joi.number().integer().min(0).default(1_000_000),
  WALLET_WITHDRAW_DAILY_CAP_MICRO: Joi.number()
    .integer()
    .min(0)
    .default(1_000_000_000),
  /** SIWS domain the wallet shows and the server verifies (no scheme). */
  SIWS_DOMAIN: Joi.string().hostname().allow('').default('oneplan.space'),
  /** CAIP-2-ish chain id put in the SIWS message; matches the money cluster. */
  SIWS_CHAIN_ID: Joi.string().allow('').default('solana:devnet'),
  /** Devnet-only test-USDC faucet for the hackathon build. Off by default. */
  WEB3_FAUCET_ENABLED: Joi.boolean().default(false),
  /**
   * Android signs with the member's own wallet over Mobile Wallet Adapter when true, the Privy
   * embedded wallet when false (served as `GET /web3/eligibility` `mwaEnabled`). iOS is always Privy.
   */
  WEB3_MWA_ENABLED: Joi.boolean().default(true),
  /** bs58 secret key of the wallet that holds the faucet's devnet USDC. */
  SOLANA_FAUCET_SECRET_KEY: Joi.string().allow('').default(''),
  FAUCET_USDC_MICRO: Joi.number()
    .integer()
    .min(1)
    .max(1_000_000_000)
    .default(5_000_000),
  /** Mainnet read-only RPC for Seeker Genesis Token / .skr lookups. Empty = identity features off. */
  SOLANA_MAINNET_RPC_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .allow('')
    .default(''),
};
