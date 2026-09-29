import type { components } from '@/api/schema';

/** Trip-domain DTO aliases — import these instead of reaching into `schema.d.ts`. */
export type TripSummaryDto = components['schemas']['TripSummaryDto'];
export type TripDto = components['schemas']['TripDto'];
export type TripMemberDto = components['schemas']['TripMemberDto'];
export type TripMemberRole = components['schemas']['TripMemberRole'];
export type InviteStatus = components['schemas']['InviteStatus'];
export type BudgetDto = components['schemas']['BudgetDto'];
export type ExpenseSummaryDto = components['schemas']['ExpenseSummaryDto'];
export type ExpenseDto = components['schemas']['ExpenseDto'];
export type TripBreakdownDto = components['schemas']['TripBreakdownDto'];
export type MemberBreakdownDto = components['schemas']['MemberBreakdownDto'];
export type BreakdownExpenseItemDto = components['schemas']['BreakdownExpenseItemDto'];
/** Single source of truth is `features/plan/types.ts` — re-exported here since `usePlanItems` lives on the trip. */
export type { PlanItemDto } from '@/features/plan/types';
export type TripPhotoDto = components['schemas']['TripPhotoDto'];
export type TripStatus = components['schemas']['TripStatus'];
export type ExpenseCategory = components['schemas']['ExpenseCategory'];
