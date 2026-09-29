// Presentation model: server state + local catalog copy for one mission.
// Ported from `MissionRowModel` in ios OnePlan/View/Missions/MissionsSheetView.swift.

/**
 * Minimal mirror of `components.schemas.MissionStateDto` (openapi/openapi.json).
 * Field names match the spec exactly so a generated `schema.d.ts` type is
 * assignable to it.
 */
export interface MissionStateDto {
  /** Mission id, e.g. "first_trip". */
  missionId: string;
  /** Catalog group: getting_started | aha | community | rhythm. */
  group: string;
  /** Spark (⚡) awarded per completion. */
  rewardAmount: number;
  /** True when a one-time mission is done, or a capped mission is fully exhausted. */
  completed: boolean;
  /** ISO 8601 timestamp of the most recent completion. */
  completedAt: string | null;
  progressCurrent?: number | null;
  progressTarget?: number | null;
  periodUsed?: number | null;
  periodCap?: number | null;
}

export interface MissionRowModel {
  id: string;
  title: string;
  subtitle: string;
  reward: number;
  completed: boolean;
}

export interface MissionCopy {
  title: string;
  subtitle: string;
}

/**
 * UI copy per spec §2 (the source of truth — the old mockup's subtitles were
 * wrong, per §7). Values are i18n keys: the app uses react-i18next with
 * key == English source text.
 */
export const MISSION_COPY: Record<string, MissionCopy> = {
  first_trip: {
    title: 'Create your first trip',
    subtitle: 'Start planning your next getaway',
  },
  first_board: {
    title: 'Create 1 board',
    subtitle: 'Save travel ideas in one place',
  },
  first_scan: {
    title: 'Scan 1 social video',
    subtitle: 'Turn a TikTok or IG Reel into pins',
  },
  first_expense: {
    title: 'Add your first expense',
    subtitle: 'Track what the group spends',
  },
  apply_plan: {
    title: 'Apply a plan from Market',
    subtitle: 'Use a ready-made itinerary in your trip',
  },
  invite_2: {
    title: 'Invite 2 friends to your trip',
    subtitle: 'Plan together, split together',
  },
  friend_joined: {
    title: 'A friend joined your trip',
    subtitle: 'Your invite worked',
  },
  trip_settled: {
    title: 'Complete a trip with expenses settled',
    subtitle: 'Finish and settle up',
  },
  share_plan: {
    title: 'Share a plan from Market',
    subtitle: 'Send a plan to a friend',
  },
  rate_plan: {
    title: 'Rate a plan you applied',
    subtitle: 'Help others pick the right plan',
  },
  upload_plan: {
    title: 'Upload your plan to Market',
    subtitle: 'Turn your trip into a plan others can use',
  },
  appstore_review: {
    title: 'Give us a review on the App Store',
    subtitle: 'It takes a minute',
  },
  plan_ahead: {
    title: 'Plan your next trip',
    subtitle: 'Create a trip 30+ days ahead',
  },
};

const identity = (key: string): string => key;

/**
 * Builds the row for one server mission. Returns `undefined` when the id has
 * no local copy, so unknown missions are silently dropped from the sheet.
 *
 * @param t translator applied to the copy keys (e.g. `i18next.t`); defaults to identity.
 */
export function missionRowFromDto(
  dto: MissionStateDto,
  t: (key: string) => string = identity,
): MissionRowModel | undefined {
  if (!Object.hasOwn(MISSION_COPY, dto.missionId)) return undefined;
  const copy = MISSION_COPY[dto.missionId];
  if (!copy) return undefined;
  return {
    id: dto.missionId,
    title: t(copy.title),
    subtitle: t(copy.subtitle),
    reward: Math.trunc(dto.rewardAmount),
    completed: dto.completed,
  };
}
