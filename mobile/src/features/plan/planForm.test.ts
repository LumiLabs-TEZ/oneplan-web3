import {
  MAX_IMAGES,
  buildCreateBody,
  buildUpdateBody,
  canSubmit,
  isBeforeTripStart,
  memberIdsToSend,
  reduce,
  remainingImageSlots,
  seedCreate,
  seedEdit,
  type PlanFormState,
  type UploadedRefs,
} from './planForm';
import type { PlanItemDto } from './types';

const NO_UPLOADS: UploadedRefs = { imageKeys: [], voice: null };

let nextId = 1;
function makeItem(overrides: Partial<PlanItemDto> = {}): PlanItemDto {
  return {
    id: nextId++,
    tripId: 1,
    title: 'Item',
    imageUrls: [],
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    members: [],
    ...overrides,
  };
}

beforeEach(() => {
  nextId = 1;
});

describe('seedCreate', () => {
  it('defaults to 08:00, "All" members, and empty fields', () => {
    const s = seedCreate({
      isPlanningMode: true,
      tripStartDate: null,
      day: 1,
      date: null,
      acceptedIds: [1, 2],
    });
    expect(s.time).toEqual({ hour: 8, minute: 0 });
    expect(s.members).toEqual({ all: true, ids: [] });
    expect(s.name).toBe('');
    expect(s.description).toBe('');
    expect(s.voice).toEqual({ kind: 'none' });
    expect(s.dayNumber).toBe(1);
  });

  it('clamps the initial date up to tripStartDate in date mode', () => {
    const s = seedCreate({
      isPlanningMode: false,
      tripStartDate: '2026-02-10',
      day: 1,
      date: '2026-02-01',
      acceptedIds: [],
    });
    expect(s.planDate).toBe('2026-02-10');
  });

  it('keeps a date on/after tripStartDate unchanged', () => {
    const s = seedCreate({
      isPlanningMode: false,
      tripStartDate: '2026-02-10',
      day: 1,
      date: '2026-02-15',
      acceptedIds: [],
    });
    expect(s.planDate).toBe('2026-02-15');
  });

  it('does not clamp in planning mode', () => {
    const s = seedCreate({
      isPlanningMode: true,
      tripStartDate: '2026-02-10',
      day: 3,
      date: null,
      acceptedIds: [],
    });
    expect(s.planDate).toBeNull();
  });
});

describe('seedEdit — All rule', () => {
  it('treats an item covering every accepted member as All', () => {
    const item = makeItem({
      members: [
        { id: 1, userId: 10, displayName: 'A' },
        { id: 2, userId: 20, displayName: 'B' },
      ],
    });
    const s = seedEdit(item, { isPlanningMode: true, tripStartDate: null, acceptedIds: [10, 20] });
    expect(s.members).toEqual({ all: true, ids: [] });
  });

  it('treats an item covering more than the accepted set as All (superset by count)', () => {
    const item = makeItem({
      members: [
        { id: 1, userId: 10, displayName: 'A' },
        { id: 2, userId: 20, displayName: 'B' },
        { id: 3, userId: 30, displayName: 'C' },
      ],
    });
    const s = seedEdit(item, { isPlanningMode: true, tripStartDate: null, acceptedIds: [10, 20] });
    expect(s.members).toEqual({ all: true, ids: [] });
  });

  it('treats a strict subset as an individual selection', () => {
    const item = makeItem({ members: [{ id: 1, userId: 10, displayName: 'A' }] });
    const s = seedEdit(item, { isPlanningMode: true, tripStartDate: null, acceptedIds: [10, 20] });
    expect(s.members).toEqual({ all: false, ids: [10] });
  });

  it('treats zero members with accepted members present as an individual (empty) selection', () => {
    const item = makeItem({ members: [] });
    const s = seedEdit(item, { isPlanningMode: true, tripStartDate: null, acceptedIds: [10, 20] });
    expect(s.members).toEqual({ all: false, ids: [] });
  });

  it('treats zero members with zero accepted members as All (size equality)', () => {
    const item = makeItem({ members: [] });
    const s = seedEdit(item, { isPlanningMode: true, tripStartDate: null, acceptedIds: [] });
    expect(s.members).toEqual({ all: true, ids: [] });
  });
});

describe('seedEdit — field hydration', () => {
  it('hydrates name/description/location/images/voice from the item', () => {
    const item = makeItem({
      title: 'Museum',
      description: 'Bring cash',
      location: 'Louvre',
      latitude: 48.86,
      longitude: 2.34,
      address: 'Rue de Rivoli',
      category: 'TICKET',
      imageUrls: ['a.jpg', 'b.jpg'],
      voiceUrl: 'voice/key.m4a',
      voiceDuration: 12,
      startTime: '14:30',
      dayNumber: 2,
    });
    const s = seedEdit(item, { isPlanningMode: true, tripStartDate: null, acceptedIds: [] });
    expect(s.name).toBe('Museum');
    expect(s.description).toBe('Bring cash');
    expect(s.location).toEqual({
      text: 'Louvre',
      latitude: 48.86,
      longitude: 2.34,
      address: 'Rue de Rivoli',
      category: 'TICKET',
    });
    expect(s.existingImageUrls).toEqual(['a.jpg', 'b.jpg']);
    expect(s.voice).toEqual({ kind: 'existing', key: 'voice/key.m4a', durationSec: 12 });
    expect(s.time).toEqual({ hour: 14, minute: 30 });
    expect(s.dayNumber).toBe(2);
  });

  it('falls back to the default time when startTime is missing/unparseable', () => {
    const item = makeItem({ startTime: null });
    const s = seedEdit(item, { isPlanningMode: true, tripStartDate: null, acceptedIds: [] });
    expect(s.time).toEqual({ hour: 8, minute: 0 });
  });

  it('has no voice when the item has none', () => {
    const item = makeItem({ voiceUrl: null });
    const s = seedEdit(item, { isPlanningMode: true, tripStartDate: null, acceptedIds: [] });
    expect(s.voice).toEqual({ kind: 'none' });
  });

  it('initialDayNumber overrides the item dayNumber', () => {
    const item = makeItem({ dayNumber: 2 });
    const s = seedEdit(item, {
      isPlanningMode: true,
      tripStartDate: null,
      acceptedIds: [],
      initialDayNumber: 5,
    });
    expect(s.dayNumber).toBe(5);
  });
});

describe('reduce — simple fields', () => {
  function base(): PlanFormState {
    return seedCreate({
      isPlanningMode: true,
      tripStartDate: null,
      day: 1,
      date: null,
      acceptedIds: [],
    });
  }

  it('name sets the trimmed-later name field verbatim', () => {
    const s = reduce(base(), { type: 'name', value: 'Beach day' });
    expect(s.name).toBe('Beach day');
  });

  it('day sets dayNumber', () => {
    const s = reduce(base(), { type: 'day', value: 4 });
    expect(s.dayNumber).toBe(4);
  });

  it('date sets planDate', () => {
    const s = reduce(base(), { type: 'date', value: '2026-03-01' });
    expect(s.planDate).toBe('2026-03-01');
  });

  it('time sets the hour/minute pair', () => {
    const s = reduce(base(), { type: 'time', value: { hour: 19, minute: 45 } });
    expect(s.time).toEqual({ hour: 19, minute: 45 });
  });

  it('description clamps to 500 characters', () => {
    const s = reduce(base(), { type: 'description', value: 'x'.repeat(600) });
    expect(s.description).toHaveLength(500);
  });
});

describe('reduce — location', () => {
  function base(): PlanFormState {
    return seedCreate({
      isPlanningMode: true,
      tripStartDate: null,
      day: 1,
      date: null,
      acceptedIds: [],
    });
  }

  it('location sets text/coords/address, mapping the raw POI category to an ExpenseCategory', () => {
    const s = reduce(base(), {
      type: 'location',
      value: {
        name: 'Eiffel Tower',
        latitude: 48.85,
        longitude: 2.29,
        address: 'Champ de Mars',
        category: 'landmark',
      },
    });
    expect(s.location).toEqual({
      text: 'Eiffel Tower',
      latitude: 48.85,
      longitude: 2.29,
      address: 'Champ de Mars',
      category: 'TICKET',
    });
  });

  it('location maps an unrecognized raw category to null, never storing the free text', () => {
    const s = reduce(base(), {
      type: 'location',
      value: { name: 'X', latitude: 1, longitude: 2, address: 'Y', category: 'z' },
    });
    expect(s.location.category).toBeNull();
  });

  it('location(null) clears the whole location', () => {
    const withLoc = reduce(base(), {
      type: 'location',
      value: { name: 'X', latitude: 1, longitude: 2, address: 'Y', category: 'landmark' },
    });
    const s = reduce(withLoc, { type: 'location', value: null });
    expect(s.location).toEqual({
      text: '',
      latitude: null,
      longitude: null,
      address: null,
      category: null,
    });
  });

  it('locationText updates the text without touching coords', () => {
    const withLoc = reduce(base(), {
      type: 'location',
      value: { name: 'X', latitude: 1, longitude: 2, address: 'Y', category: 'landmark' },
    });
    const s = reduce(withLoc, { type: 'locationText', value: 'X annex' });
    expect(s.location).toEqual({
      text: 'X annex',
      latitude: 1,
      longitude: 2,
      address: 'Y',
      category: 'TICKET',
    });
  });

  it('locationText clearing (blank/whitespace) drops coords and address', () => {
    const withLoc = reduce(base(), {
      type: 'location',
      value: { name: 'X', latitude: 1, longitude: 2, address: 'Y', category: 'landmark' },
    });
    const s = reduce(withLoc, { type: 'locationText', value: '   ' });
    expect(s.location).toEqual({
      text: '   ',
      latitude: null,
      longitude: null,
      address: null,
      category: 'TICKET',
    });
  });
});

describe('reduce — members (All rule / toggle)', () => {
  const accepted = [1, 2, 3];

  it('toggling a member while All is selected switches to that member only', () => {
    const s = reduce(
      seedCreate({
        isPlanningMode: true,
        tripStartDate: null,
        day: 1,
        date: null,
        acceptedIds: accepted,
      }),
      { type: 'toggleMember', id: 1, acceptedIds: accepted },
    );
    expect(s.members).toEqual({ all: false, ids: [1] });
  });

  it('deselecting the only individually-picked member reverts to All', () => {
    let s = seedCreate({
      isPlanningMode: true,
      tripStartDate: null,
      day: 1,
      date: null,
      acceptedIds: accepted,
    });
    s = reduce(s, { type: 'toggleMember', id: 1, acceptedIds: accepted });
    s = reduce(s, { type: 'toggleMember', id: 1, acceptedIds: accepted });
    expect(s.members).toEqual({ all: true, ids: [] });
  });

  it('toggling every accepted member individually stays an explicit selection (does not collapse to All)', () => {
    let s = seedCreate({
      isPlanningMode: true,
      tripStartDate: null,
      day: 1,
      date: null,
      acceptedIds: accepted,
    });
    s = reduce(s, { type: 'toggleMember', id: 1, acceptedIds: accepted });
    s = reduce(s, { type: 'toggleMember', id: 2, acceptedIds: accepted });
    s = reduce(s, { type: 'toggleMember', id: 3, acceptedIds: accepted });
    expect(s.members).toEqual({ all: false, ids: [1, 2, 3] });
  });

  it('toggling two of three accepted members stays an individual selection', () => {
    let s = seedCreate({
      isPlanningMode: true,
      tripStartDate: null,
      day: 1,
      date: null,
      acceptedIds: accepted,
    });
    s = reduce(s, { type: 'toggleMember', id: 1, acceptedIds: accepted });
    s = reduce(s, { type: 'toggleMember', id: 2, acceptedIds: accepted });
    expect(s.members).toEqual({ all: false, ids: [1, 2] });
  });

  it('selectAll resets to the All state', () => {
    let s = seedCreate({
      isPlanningMode: true,
      tripStartDate: null,
      day: 1,
      date: null,
      acceptedIds: accepted,
    });
    s = reduce(s, { type: 'toggleMember', id: 1, acceptedIds: accepted });
    s = reduce(s, { type: 'selectAll' });
    expect(s.members).toEqual({ all: true, ids: [] });
  });
});

describe('reduce — images', () => {
  function base(existing: string[] = []): PlanFormState {
    const s = seedCreate({
      isPlanningMode: true,
      tripStartDate: null,
      day: 1,
      date: null,
      acceptedIds: [],
    });
    return { ...s, existingImageUrls: existing };
  }

  it('addImages appends new local uris', () => {
    const s = reduce(base(), { type: 'addImages', uris: ['a', 'b'] });
    expect(s.newImageUris).toEqual(['a', 'b']);
  });

  it('addImages truncates to the remaining slots', () => {
    const s = reduce(base(['e1', 'e2', 'e3', 'e4']), { type: 'addImages', uris: ['a', 'b', 'c'] });
    expect(s.newImageUris).toEqual(['a']);
  });

  it('addImages is a no-op once full', () => {
    const s = reduce(base(['e1', 'e2', 'e3', 'e4', 'e5']), { type: 'addImages', uris: ['a'] });
    expect(s.newImageUris).toEqual([]);
  });

  it('removeExisting removes by index', () => {
    const s = reduce(base(['e1', 'e2']), { type: 'removeExisting', index: 0 });
    expect(s.existingImageUrls).toEqual(['e2']);
  });

  it('removeNew removes by index', () => {
    let s = base();
    s = reduce(s, { type: 'addImages', uris: ['a', 'b'] });
    s = reduce(s, { type: 'removeNew', index: 0 });
    expect(s.newImageUris).toEqual(['b']);
  });
});

describe('reduce — voice', () => {
  it('voiceRecorded sets a new recording', () => {
    const s = reduce(
      seedCreate({
        isPlanningMode: true,
        tripStartDate: null,
        day: 1,
        date: null,
        acceptedIds: [],
      }),
      { type: 'voiceRecorded', uri: 'file://x.m4a', durationSec: 5 },
    );
    expect(s.voice).toEqual({ kind: 'new', uri: 'file://x.m4a', durationSec: 5 });
  });

  it('voiceDeleted on an existing voice marks it cleared', () => {
    const item = makeItem({ voiceUrl: 'k', voiceDuration: 3 });
    const s = reduce(
      seedEdit(item, { isPlanningMode: true, tripStartDate: null, acceptedIds: [] }),
      { type: 'voiceDeleted' },
    );
    expect(s.voice).toEqual({ kind: 'cleared' });
  });

  it('voiceDeleted with nothing existing is a no-op (stays none)', () => {
    const s = reduce(
      seedCreate({
        isPlanningMode: true,
        tripStartDate: null,
        day: 1,
        date: null,
        acceptedIds: [],
      }),
      { type: 'voiceDeleted' },
    );
    expect(s.voice).toEqual({ kind: 'none' });
  });

  it('voiceDeleted after a fresh recording reverts to none (discarding the take)', () => {
    let s = seedCreate({
      isPlanningMode: true,
      tripStartDate: null,
      day: 1,
      date: null,
      acceptedIds: [],
    });
    s = reduce(s, { type: 'voiceRecorded', uri: 'file://x.m4a', durationSec: 5 });
    s = reduce(s, { type: 'voiceDeleted' });
    expect(s.voice).toEqual({ kind: 'none' });
  });
});

describe('remainingImageSlots', () => {
  it('is MAX_IMAGES with nothing picked', () => {
    const s = seedCreate({
      isPlanningMode: true,
      tripStartDate: null,
      day: 1,
      date: null,
      acceptedIds: [],
    });
    expect(remainingImageSlots(s)).toBe(MAX_IMAGES);
  });

  it('counts existing + new against the max', () => {
    const s = {
      ...seedCreate({
        isPlanningMode: true,
        tripStartDate: null,
        day: 1,
        date: null,
        acceptedIds: [],
      }),
      existingImageUrls: ['a'],
      newImageUris: ['b', 'c'],
    };
    expect(remainingImageSlots(s)).toBe(MAX_IMAGES - 3);
  });

  it('never goes below zero', () => {
    const s = {
      ...seedCreate({
        isPlanningMode: true,
        tripStartDate: null,
        day: 1,
        date: null,
        acceptedIds: [],
      }),
      existingImageUrls: ['a', 'b', 'c', 'd', 'e', 'f'],
    };
    expect(remainingImageSlots(s)).toBe(0);
  });
});

describe('isBeforeTripStart / canSubmit', () => {
  it('is false in planning mode regardless of dates', () => {
    const s: PlanFormState = {
      ...seedCreate({
        isPlanningMode: true,
        tripStartDate: '2026-05-10',
        day: 1,
        date: null,
        acceptedIds: [],
      }),
      planDate: '2026-01-01',
    };
    expect(isBeforeTripStart(s)).toBe(false);
  });

  it('is true in date mode when planDate precedes tripStartDate', () => {
    const s = seedCreate({
      isPlanningMode: false,
      tripStartDate: '2026-05-10',
      day: 1,
      date: '2026-05-10',
      acceptedIds: [],
    });
    const before = { ...s, planDate: '2026-05-09' };
    expect(isBeforeTripStart(before)).toBe(true);
  });

  it('is false in date mode when planDate is on/after tripStartDate', () => {
    const s = seedCreate({
      isPlanningMode: false,
      tripStartDate: '2026-05-10',
      day: 1,
      date: '2026-05-10',
      acceptedIds: [],
    });
    expect(isBeforeTripStart(s)).toBe(false);
  });

  it('canSubmit is false with a blank/whitespace-only name', () => {
    const s = reduce(
      seedCreate({
        isPlanningMode: true,
        tripStartDate: null,
        day: 1,
        date: null,
        acceptedIds: [],
      }),
      { type: 'name', value: '   ' },
    );
    expect(canSubmit(s)).toBe(false);
  });

  it('canSubmit is false when before the trip start date even with a name', () => {
    const seeded = seedCreate({
      isPlanningMode: false,
      tripStartDate: '2026-05-10',
      day: 1,
      date: '2026-05-10',
      acceptedIds: [],
    });
    // Bypass the seed-time clamp to exercise a since-edited, now-earlier date.
    const s = reduce({ ...seeded, planDate: '2026-05-09' }, { type: 'name', value: 'Trip' });
    expect(canSubmit(s)).toBe(false);
  });

  it('canSubmit is true with a trimmed name and a valid date', () => {
    const s = reduce(
      seedCreate({
        isPlanningMode: true,
        tripStartDate: null,
        day: 1,
        date: null,
        acceptedIds: [],
      }),
      { type: 'name', value: 'Trip' },
    );
    expect(canSubmit(s)).toBe(true);
  });
});

describe('memberIdsToSend', () => {
  it('sends every accepted id when All is selected', () => {
    const s = seedCreate({
      isPlanningMode: true,
      tripStartDate: null,
      day: 1,
      date: null,
      acceptedIds: [],
    });
    expect(memberIdsToSend(s, [5, 6, 7])).toEqual([5, 6, 7]);
  });

  it('sends only the picked accepted ids, in accepted order, when not All', () => {
    let s = seedCreate({
      isPlanningMode: true,
      tripStartDate: null,
      day: 1,
      date: null,
      acceptedIds: [5, 6, 7],
    });
    s = reduce(s, { type: 'toggleMember', id: 7, acceptedIds: [5, 6, 7] });
    expect(memberIdsToSend(s, [5, 6, 7])).toEqual([7]);
  });
});

describe('buildCreateBody', () => {
  function planningState(): PlanFormState {
    let s = seedCreate({
      isPlanningMode: true,
      tripStartDate: null,
      day: 2,
      date: null,
      acceptedIds: [1, 2],
    });
    s = reduce(s, { type: 'name', value: '  Museum  ' });
    return s;
  }

  it('sends dayNumber (not planDate) in planning mode', () => {
    const body = buildCreateBody(planningState(), [1, 2], NO_UPLOADS);
    expect(body.dayNumber).toBe(2);
    expect(body.planDate).toBeUndefined();
  });

  it('sends planDate (not dayNumber) in date mode', () => {
    const s = seedCreate({
      isPlanningMode: false,
      tripStartDate: null,
      day: 1,
      date: '2026-04-01',
      acceptedIds: [],
    });
    const body = buildCreateBody(s, [], NO_UPLOADS);
    expect(body.planDate).toBe('2026-04-01');
    expect(body.dayNumber).toBeUndefined();
  });

  it('trims the title and formats startTime as HH:mm', () => {
    const body = buildCreateBody(planningState(), [1, 2], NO_UPLOADS);
    expect(body.title).toBe('Museum');
    expect(body.startTime).toBe('08:00');
  });

  it('omits description/location/imageUrls when empty', () => {
    const body = buildCreateBody(planningState(), [1, 2], NO_UPLOADS);
    expect(body.description).toBeUndefined();
    expect(body.location).toBeUndefined();
    expect(body.latitude).toBeUndefined();
    expect(body.imageUrls).toBeUndefined();
  });

  it('includes description/location when set', () => {
    let s = planningState();
    s = reduce(s, { type: 'description', value: 'Bring cash' });
    s = reduce(s, {
      type: 'location',
      value: { name: 'Louvre', latitude: 1, longitude: 2, address: 'Rue', category: 'museum' },
    });
    const body = buildCreateBody(s, [1, 2], NO_UPLOADS);
    expect(body.description).toBe('Bring cash');
    expect(body.location).toBe('Louvre');
    expect(body.latitude).toBe(1);
    expect(body.longitude).toBe(2);
    expect(body.address).toBe('Rue');
  });

  it('combines existing + newly-uploaded image keys, omitted only when both are empty', () => {
    let s = planningState();
    s = { ...s, existingImageUrls: ['e1'] };
    const body = buildCreateBody(s, [1, 2], { imageKeys: ['k1'], voice: null });
    expect(body.imageUrls).toEqual(['e1', 'k1']);
  });

  it('sends voice only when uploaded refs include one', () => {
    const withVoice = buildCreateBody(planningState(), [1, 2], {
      imageKeys: [],
      voice: { key: 'v1', durationSec: 9 },
    });
    expect(withVoice.voiceUrl).toBe('v1');
    expect(withVoice.voiceDuration).toBe(9);

    const withoutVoice = buildCreateBody(planningState(), [1, 2], NO_UPLOADS);
    expect(withoutVoice.voiceUrl).toBeUndefined();
    expect(withoutVoice.voiceDuration).toBeUndefined();
  });

  it('sends userIds resolved from the All rule', () => {
    const body = buildCreateBody(planningState(), [1, 2], NO_UPLOADS);
    expect(body.userIds).toEqual([1, 2]);
  });

  it('body.category is a real ExpenseCategory enum value when the picked place mapped to one', () => {
    let s = planningState();
    s = reduce(s, {
      type: 'location',
      value: { name: 'Louvre', latitude: 1, longitude: 2, address: 'Rue', category: 'museum' },
    });
    const body = buildCreateBody(s, [1, 2], NO_UPLOADS);
    expect(body.category).toBe('TICKET');
  });

  it('omits body.category (never sends raw free text) when the picked place had no mappable category', () => {
    let s = planningState();
    s = reduce(s, {
      type: 'location',
      value: {
        name: 'Louvre',
        latitude: 1,
        longitude: 2,
        address: 'Rue',
        category: 'some unmapped place kind',
      },
    });
    const body = buildCreateBody(s, [1, 2], NO_UPLOADS);
    expect(body.category).toBeUndefined();
  });
});

describe('buildUpdateBody', () => {
  function editState(item: PlanItemDto): PlanFormState {
    return seedEdit(item, { isPlanningMode: true, tripStartDate: null, acceptedIds: [1, 2] });
  }

  it('always sends title/startTime/userIds/imageUrls even when nothing changed', () => {
    const item = makeItem({
      title: 'Museum',
      startTime: '09:00',
      imageUrls: ['e1'],
      members: [
        { id: 1, userId: 1, displayName: 'A' },
        { id: 2, userId: 2, displayName: 'B' },
      ],
    });
    const body = buildUpdateBody(editState(item), [1, 2], NO_UPLOADS);
    expect(body.title).toBe('Museum');
    expect(body.startTime).toBe('09:00');
    expect(body.userIds).toEqual([1, 2]);
    expect(body.imageUrls).toEqual(['e1']);
  });

  it('sends "" (not omitted) to clear the description', () => {
    const item = makeItem({ description: 'old note' });
    let s = editState(item);
    s = reduce(s, { type: 'description', value: '' });
    const body = buildUpdateBody(s, [1, 2], NO_UPLOADS);
    expect(body.description).toBe('');
  });

  it('sends an empty imageUrls array to clear all images', () => {
    const item = makeItem({ imageUrls: ['e1', 'e2'] });
    let s = editState(item);
    s = reduce(s, { type: 'removeExisting', index: 0 });
    s = reduce(s, { type: 'removeExisting', index: 0 });
    const body = buildUpdateBody(s, [1, 2], NO_UPLOADS);
    expect(body.imageUrls).toEqual([]);
  });

  it('nulls location/latitude/longitude/address together when text is cleared', () => {
    const item = makeItem({ location: 'Louvre', latitude: 1, longitude: 2, address: 'Rue' });
    let s = editState(item);
    s = reduce(s, { type: 'locationText', value: '' });
    const body = buildUpdateBody(s, [1, 2], NO_UPLOADS);
    expect(body.location).toBeNull();
    expect(body.latitude).toBeNull();
    expect(body.longitude).toBeNull();
    expect(body.address).toBeNull();
  });

  it('keeps location/coords when unchanged', () => {
    const item = makeItem({ location: 'Louvre', latitude: 1, longitude: 2, address: 'Rue' });
    const body = buildUpdateBody(editState(item), [1, 2], NO_UPLOADS);
    expect(body.location).toBe('Louvre');
    expect(body.latitude).toBe(1);
    expect(body.longitude).toBe(2);
    expect(body.address).toBe('Rue');
  });

  it('sends dayNumber in planning mode, planDate in date mode', () => {
    const item = makeItem({ dayNumber: 3 });
    const planning = buildUpdateBody(
      seedEdit(item, { isPlanningMode: true, tripStartDate: null, acceptedIds: [] }),
      [],
      NO_UPLOADS,
    );
    expect(planning.dayNumber).toBe(3);
    expect(planning.planDate).toBeUndefined();

    const dated = makeItem({ planDate: '2026-04-01' });
    const dateMode = buildUpdateBody(
      seedEdit(dated, { isPlanningMode: false, tripStartDate: null, acceptedIds: [] }),
      [],
      NO_UPLOADS,
    );
    expect(dateMode.planDate).toBe('2026-04-01');
    expect(dateMode.dayNumber).toBeUndefined();
  });

  it('a new voice upload wins and sends key+duration', () => {
    const item = makeItem({ voiceUrl: 'old-key', voiceDuration: 5 });
    const body = buildUpdateBody(editState(item), [1, 2], {
      imageKeys: [],
      voice: { key: 'new-key', durationSec: 8 },
    });
    expect(body.voiceUrl).toBe('new-key');
    expect(body.voiceDuration).toBe(8);
  });

  it('an explicit clear sends voiceUrl/voiceDuration as null', () => {
    const item = makeItem({ voiceUrl: 'old-key', voiceDuration: 5 });
    let s = editState(item);
    s = reduce(s, { type: 'voiceDeleted' });
    const body = buildUpdateBody(s, [1, 2], NO_UPLOADS);
    expect(body.voiceUrl).toBeNull();
    expect(body.voiceDuration).toBeNull();
  });

  it('an untouched existing voice omits voiceUrl/voiceDuration entirely', () => {
    const item = makeItem({ voiceUrl: 'old-key', voiceDuration: 5 });
    const body = buildUpdateBody(editState(item), [1, 2], NO_UPLOADS);
    expect(body.voiceUrl).toBeUndefined();
    expect(body.voiceDuration).toBeUndefined();
  });

  it('no voice at all omits voiceUrl/voiceDuration', () => {
    const item = makeItem({ voiceUrl: null });
    const body = buildUpdateBody(editState(item), [1, 2], NO_UPLOADS);
    expect(body.voiceUrl).toBeUndefined();
    expect(body.voiceDuration).toBeUndefined();
  });

  it('body.category is a real ExpenseCategory enum value when the picked place mapped to one', () => {
    const item = makeItem({});
    let s = editState(item);
    s = reduce(s, {
      type: 'location',
      value: { name: 'Louvre', latitude: 1, longitude: 2, address: 'Rue', category: 'museum' },
    });
    const body = buildUpdateBody(s, [1, 2], NO_UPLOADS);
    expect(body.category).toBe('TICKET');
  });

  it('omits body.category (never sends raw free text or null) when the picked place had no mappable category', () => {
    const item = makeItem({});
    let s = editState(item);
    s = reduce(s, {
      type: 'location',
      value: {
        name: 'Louvre',
        latitude: 1,
        longitude: 2,
        address: 'Rue',
        category: 'some unmapped place kind',
      },
    });
    const body = buildUpdateBody(s, [1, 2], NO_UPLOADS);
    expect(body.category).toBeUndefined();
  });
});
