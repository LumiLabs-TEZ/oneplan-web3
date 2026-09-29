import type { components } from '@/api/schema';

/**
 * Re-exported here (rather than only from `api/queries.ts`) so `components/` doesn't have to
 * depend on the query layer — matches the task-M4.1 brief.
 */
export type PassportSummaryDto = components['schemas']['PassportSummaryDto'];
