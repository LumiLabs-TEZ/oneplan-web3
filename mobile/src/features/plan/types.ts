import type { components } from '@/api/schema';

/** Plan-domain DTO aliases — import these instead of reaching into `schema.d.ts`. */
export type PlanItemDto = components['schemas']['PlanItemDto'];
export type PlanItemMemberDto = components['schemas']['PlanItemMemberDto'];
export type CreatePlanItemDto = components['schemas']['CreatePlanItemDto'];
export type UpdatePlanItemDto = components['schemas']['UpdatePlanItemDto'];
export type PlanRouteDto = components['schemas']['PlanRouteDto'];
export type PlanRoutePinDto = components['schemas']['PlanRoutePinDto'];
export type PlanRouteLegDto = components['schemas']['PlanRouteLegDto'];
export type LocationPlanCountDto = components['schemas']['LocationPlanCountDto'];
