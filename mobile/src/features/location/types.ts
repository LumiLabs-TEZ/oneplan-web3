/**
 * Shared location-pick shape used by the place-search sheet, recent locations,
 * and the plan-item location field. Structurally compatible with
 * `PlanFormLocationPick` (`features/plan/planForm.ts`) plus a `source` tag so
 * screens can show provenance (search / recent / suggested / map tap).
 */
export interface LocationPick {
  name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  category: string | null;
  source: 'search' | 'recent' | 'suggested' | 'map' | 'board';
}
