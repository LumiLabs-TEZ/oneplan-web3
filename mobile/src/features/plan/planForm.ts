/**
 * Pure, UI-free state model for the create/edit plan-item form.
 *
 * Port of `ios/OnePlan/OnePlan/View/Plan/PlanFormModel.swift`:
 * - fields/defaults: :42-130
 * - edit hydration + "All" member rule: :205-285 (esp. :215-224, :269-280)
 * - submit wire-body rules: :320-450
 *
 * No side effects, no fetch, no dates constructed from `new Date()` other than
 * what the caller passes in — screens own the clock and the reducer stays
 * trivially testable.
 */
import { expenseCategoryForPoi } from '@/features/location/helpers/poiCategory';
import { parseDateOnly, startOfDay } from '@/features/trip/helpers/dateRange';

import { dateForDay, parseHourMinute } from './helpers/planDays';
import { hhmm } from './helpers/timeLabel';
import type { CreatePlanItemDto, PlanItemDto, UpdatePlanItemDto } from './types';

export const MAX_IMAGES = 5;

/** Default start time when neither create nor edit hydration supplies one
 * (`PlanFormModel.defaultStartTime`, :460-465). */
export const DEFAULT_TIME = { hour: 8, minute: 0 } as const;

export interface PlanFormLocation {
  text: string;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  /** Already mapped to an `ExpenseCategory` wire value (or `null` when the POI picker's raw
   * category text didn't match anything) — the `'location'` reducer case runs
   * `expenseCategoryForPoi` on the pick's raw category before it lands here, so this field is
   * always send-ready and never free text. */
  category: CreatePlanItemDto['category'] | null;
}

export interface PlanFormMembers {
  all: boolean;
  /** Only meaningful when `all` is `false`. */
  ids: number[];
}

export type PlanFormVoice =
  | { kind: 'none' }
  | { kind: 'existing'; key: string; durationSec: number | null }
  | { kind: 'new'; uri: string; durationSec: number | null }
  | { kind: 'cleared' };

export type PlanFormMode = { kind: 'create' } | { kind: 'edit'; item: PlanItemDto };

export interface PlanFormState {
  mode: PlanFormMode;
  isPlanningMode: boolean;
  tripStartDate: string | null;
  name: string;
  dayNumber: number;
  /** `yyyy-MM-dd`, only meaningful when `!isPlanningMode`. */
  planDate: string | null;
  time: { hour: number; minute: number };
  location: PlanFormLocation;
  members: PlanFormMembers;
  existingImageUrls: string[];
  newImageUris: string[];
  /** Trimmed/clamped to 500 chars. */
  description: string;
  voice: PlanFormVoice;
}

/** Payload for the `location` action — a place picked from search, or `null`
 * to clear the location entirely. Exported so a later task (`src/features/location`)
 * can alias its `LocationPick` type to this shape. */
export type PlanFormLocationPick = {
  name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  category: string | null;
} | null;

export type PlanFormAction =
  | { type: 'name'; value: string }
  | { type: 'day'; value: number }
  | { type: 'date'; value: string }
  | { type: 'time'; value: { hour: number; minute: number } }
  | { type: 'location'; value: PlanFormLocationPick }
  | { type: 'locationText'; value: string }
  | { type: 'toggleMember'; id: number; acceptedIds: readonly number[] }
  | { type: 'selectAll' }
  | { type: 'addImages'; uris: readonly string[] }
  | { type: 'removeExisting'; index: number }
  | { type: 'removeNew'; index: number }
  | { type: 'description'; value: string }
  | { type: 'voiceRecorded'; uri: string; durationSec: number | null }
  | { type: 'voiceDeleted' };

const EMPTY_LOCATION: PlanFormLocation = {
  text: '',
  latitude: null,
  longitude: null,
  address: null,
  category: null,
};

/** Clamps `date` to `minStart` (both `yyyy-MM-dd`), never producing a date
 * earlier than the trip's start (`PlanFormModel.clampPlanDateToTripStartIfNeeded`,
 * :302-310). `null` inputs pass through / fall back to `minStart`. */
function clampToTripStart(date: string | null, minStart: string | null): string | null {
  if (!minStart) return date;
  if (!date) return minStart;
  const start = startOfDay(parseDateOnly(minStart));
  const selected = startOfDay(parseDateOnly(date));
  return selected.getTime() < start.getTime() ? minStart : date;
}

/** Seeds a fresh create form. `day`/`date` are the caller-resolved initial
 * day number / date string (mirrors `hydrateForCreate`, :162-177) — this
 * module doesn't compute "available days" itself (see `helpers/planDays.ts`). */
export function seedCreate(opts: {
  isPlanningMode: boolean;
  tripStartDate: string | null;
  day: number;
  date: string | null;
  acceptedIds: readonly number[];
}): PlanFormState {
  return {
    mode: { kind: 'create' },
    isPlanningMode: opts.isPlanningMode,
    tripStartDate: opts.tripStartDate,
    name: '',
    dayNumber: opts.day,
    planDate: opts.isPlanningMode ? opts.date : clampToTripStart(opts.date, opts.tripStartDate),
    time: { ...DEFAULT_TIME },
    location: { ...EMPTY_LOCATION },
    members: { all: true, ids: [] },
    existingImageUrls: [],
    newImageUris: [],
    description: '',
    voice: { kind: 'none' },
  };
}

/** Seeds an edit form from an existing `PlanItemDto` (`hydrateForEdit`, :179-226). */
export function seedEdit(
  item: PlanItemDto,
  opts: {
    isPlanningMode: boolean;
    tripStartDate: string | null;
    acceptedIds: readonly number[];
    initialDayNumber?: number;
  },
): PlanFormState {
  const time = parseHourMinute(item.startTime) ?? { ...DEFAULT_TIME };

  const acceptedSet = new Set(opts.acceptedIds);
  const itemIds = item.members.map((m) => m.userId);
  const itemSet = new Set(itemIds);
  const equalsAccepted =
    itemSet.size === acceptedSet.size && [...itemSet].every((id) => acceptedSet.has(id));
  // Lenient "All" detection (PlanFormModel.swift:215-224): equal to, or a
  // superset in size of, the accepted-member set counts as "All".
  const all = equalsAccepted || itemSet.size >= acceptedSet.size;

  const planDate = item.planDate ?? (opts.isPlanningMode ? null : opts.tripStartDate);

  return {
    mode: { kind: 'edit', item },
    isPlanningMode: opts.isPlanningMode,
    tripStartDate: opts.tripStartDate,
    name: item.title,
    dayNumber: opts.initialDayNumber ?? item.dayNumber ?? 1,
    planDate,
    time,
    location: {
      text: item.location ?? '',
      latitude: item.latitude ?? null,
      longitude: item.longitude ?? null,
      address: item.address ?? null,
      category: item.category ?? null,
    },
    members: all ? { all: true, ids: [] } : { all: false, ids: [...itemSet] },
    existingImageUrls: [...item.imageUrls],
    newImageUris: [],
    description: item.description ?? '',
    voice: item.voiceUrl
      ? { kind: 'existing', key: item.voiceUrl, durationSec: item.voiceDuration ?? null }
      : { kind: 'none' },
  };
}

/** Deselecting the last individually-picked member collapses back to "All"
 * (`PlanFormModel.toggleMember`, :269-280). Selecting every accepted member
 * one-by-one does NOT collapse to All — only the lenient edit-hydration rule
 * (:215-224) treats a full/superset selection as All; interactive toggling
 * stays an explicit individual selection until it empties out. */
function toggleMember(members: PlanFormMembers, id: number): PlanFormMembers {
  const ids = new Set(members.all ? [] : members.ids);
  if (ids.has(id)) {
    ids.delete(id);
  } else {
    ids.add(id);
  }
  if (ids.size === 0) {
    return { all: true, ids: [] };
  }
  return { all: false, ids: [...ids].sort((a, b) => a - b) };
}

export function reduce(state: PlanFormState, action: PlanFormAction): PlanFormState {
  switch (action.type) {
    case 'name':
      return { ...state, name: action.value };
    case 'day':
      return { ...state, dayNumber: action.value };
    case 'date':
      return { ...state, planDate: action.value };
    case 'time':
      return { ...state, time: action.value };
    case 'location':
      return {
        ...state,
        location: action.value
          ? {
              text: action.value.name,
              latitude: action.value.latitude,
              longitude: action.value.longitude,
              address: action.value.address,
              category: expenseCategoryForPoi(action.value.category),
            }
          : { ...EMPTY_LOCATION },
      };
    case 'locationText': {
      const cleared = action.value.trim() === '';
      return {
        ...state,
        location: cleared
          ? {
              ...state.location,
              text: action.value,
              latitude: null,
              longitude: null,
              address: null,
            }
          : { ...state.location, text: action.value },
      };
    }
    case 'toggleMember':
      return { ...state, members: toggleMember(state.members, action.id) };
    case 'selectAll':
      return { ...state, members: { all: true, ids: [] } };
    case 'addImages': {
      const slots = remainingImageSlots(state);
      if (slots <= 0) return state;
      return { ...state, newImageUris: [...state.newImageUris, ...action.uris.slice(0, slots)] };
    }
    case 'removeExisting':
      return {
        ...state,
        existingImageUrls: state.existingImageUrls.filter((_, i) => i !== action.index),
      };
    case 'removeNew':
      return { ...state, newImageUris: state.newImageUris.filter((_, i) => i !== action.index) };
    case 'description':
      return { ...state, description: action.value.slice(0, 500) };
    case 'voiceRecorded':
      return { ...state, voice: { kind: 'new', uri: action.uri, durationSec: action.durationSec } };
    case 'voiceDeleted':
      return {
        ...state,
        voice: state.voice.kind === 'existing' ? { kind: 'cleared' } : { kind: 'none' },
      };
    default:
      return state;
  }
}

export function remainingImageSlots(state: PlanFormState): number {
  return Math.max(0, MAX_IMAGES - (state.existingImageUrls.length + state.newImageUris.length));
}

/** `true` only in date mode, when the selected date falls before the trip's
 * start date (`PlanFormModel.isBeforeTripStartDate`, :117-121). */
export function isBeforeTripStart(state: PlanFormState): boolean {
  if (state.isPlanningMode || !state.tripStartDate || !state.planDate) return false;
  const start = startOfDay(parseDateOnly(state.tripStartDate));
  const selected = startOfDay(parseDateOnly(state.planDate));
  return selected.getTime() < start.getTime();
}

/** Trimmed name required; before-trip-start gating only applies in date mode
 * (`PlanFormModel.canSubmit`, :123-128). */
export function canSubmit(state: PlanFormState): boolean {
  return state.name.trim().length > 0 && !isBeforeTripStart(state);
}

/** Resolves which accepted-member ids to send: everyone when "All", else the
 * accepted ids the user individually picked, in accepted order
 * (`PlanFormModel.submit`, :338-341). */
export function memberIdsToSend(state: PlanFormState, acceptedIds: readonly number[]): number[] {
  if (state.members.all) return [...acceptedIds];
  const picked = new Set(state.members.ids);
  return acceptedIds.filter((id) => picked.has(id));
}

/** Freshly-uploaded refs resolved by the caller right before submit: new
 * image object keys (empty when nothing new was picked) and, when a new
 * voice recording exists, its uploaded key + duration. */
export interface UploadedRefs {
  imageKeys: string[];
  voice: { key: string; durationSec: number | null } | null;
}

function resolvedDay(state: PlanFormState): { planDate?: string; dayNumber?: number } {
  if (state.isPlanningMode) return { dayNumber: state.dayNumber };
  return state.planDate ? { planDate: state.planDate } : {};
}

/**
 * Builds the create-item wire body. `planDate` XOR `dayNumber` per mode;
 * `description`/`location`/`imageUrls` are omitted entirely when empty
 * (`PlanFormModel.submit`, :404-422 / create branch).
 */
export function buildCreateBody(
  state: PlanFormState,
  acceptedIds: readonly number[],
  up: UploadedRefs,
): CreatePlanItemDto {
  const trimmedDesc = state.description.trim();
  const trimmedLoc = state.location.text.trim();

  const body: CreatePlanItemDto = {
    title: state.name.trim(),
    startTime: hhmm(state.time.hour, state.time.minute),
    userIds: memberIdsToSend(state, acceptedIds),
    ...resolvedDay(state),
  };

  if (trimmedDesc !== '') body.description = trimmedDesc;

  if (trimmedLoc !== '') {
    body.location = trimmedLoc;
    if (state.location.latitude != null) body.latitude = state.location.latitude;
    if (state.location.longitude != null) body.longitude = state.location.longitude;
    if (state.location.address != null) body.address = state.location.address;
  }
  if (state.location.category) body.category = state.location.category;

  const imageUrls = [...state.existingImageUrls, ...up.imageKeys];
  if (imageUrls.length > 0) body.imageUrls = imageUrls;

  if (up.voice) {
    body.voiceUrl = up.voice.key;
    if (up.voice.durationSec != null) body.voiceDuration = up.voice.durationSec;
  }

  return body;
}

/**
 * Builds the update-item wire body. Always sends `title`/`startTime`/`userIds`/
 * `imageUrls` (an empty array clears images); `description` sends `''` to
 * clear (never omitted); location fields go `null` together when the text is
 * cleared; voice: a new upload wins, else an explicit clear sends `null`s,
 * else an unchanged existing voice is omitted entirely
 * (`PlanFormModel.submit`, :430-448 / edit branch, and :347-373 for the voice
 * resolution order).
 */
export function buildUpdateBody(
  state: PlanFormState,
  acceptedIds: readonly number[],
  up: UploadedRefs,
): UpdatePlanItemDto {
  const trimmedLoc = state.location.text.trim();

  const body: UpdatePlanItemDto = {
    title: state.name.trim(),
    startTime: hhmm(state.time.hour, state.time.minute),
    userIds: memberIdsToSend(state, acceptedIds),
    imageUrls: [...state.existingImageUrls, ...up.imageKeys],
    description: state.description.trim(),
  };
  if (state.isPlanningMode) {
    body.dayNumber = state.dayNumber;
  } else {
    // Edit always sends the current date, `null` when somehow unset.
    body.planDate = state.planDate;
  }

  if (trimmedLoc === '') {
    body.location = null;
    body.latitude = null;
    body.longitude = null;
    body.address = null;
  } else {
    body.location = trimmedLoc;
    body.latitude = state.location.latitude ?? null;
    body.longitude = state.location.longitude ?? null;
    body.address = state.location.address ?? null;
  }
  if (state.location.category) body.category = state.location.category;

  if (up.voice) {
    body.voiceUrl = up.voice.key;
    body.voiceDuration = up.voice.durationSec ?? null;
  } else if (state.voice.kind === 'cleared') {
    body.voiceUrl = null;
    body.voiceDuration = null;
  }
  // `existing` (unchanged) and `none` omit voiceUrl/voiceDuration entirely.

  return body;
}

// `dateForDay` is re-exported for screens that seed `date`/`day` from a
// selected day number without importing `helpers/planDays.ts` directly.
export { dateForDay };
