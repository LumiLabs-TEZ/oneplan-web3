import type { components } from '@/api/schema';

/** Settlement-domain DTO aliases — import these instead of reaching into `schema.d.ts`. */
export type CounterpartySettlementDto = components['schemas']['CounterpartySettlementDto'];
export type SettlementItemDto = components['schemas']['SettlementItemDto'];
export type TripSettlementSummaryDto = components['schemas']['TripSettlementSummaryDto'];
export type SettleCounterpartyDto = components['schemas']['SettleCounterpartyDto'];
export type LeaveSettlementDto = components['schemas']['LeaveSettlementDto'];
