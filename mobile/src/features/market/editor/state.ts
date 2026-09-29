import type { components } from '@/api/schema';
import type { Listing } from '../api/queries';
export type Fields = components['schemas']['CreateDraftListingDto'];
export type Activity = components['schemas']['CreateMarketItemDto'] & { key: string; id?: number };
export interface Document {
  importedImages?: string[];
  fields: Fields;
  coverUri?: string;
  activities: Activity[];
}
export interface EditorState {
  current: Document;
  baseline: string;
}
export function snapshot(document: Document) {
  return JSON.stringify(document);
}
export function editorState(document: Document): EditorState {
  return { current: document, baseline: snapshot(document) };
}
export function isDirty(state: EditorState) {
  return snapshot(state.current) !== state.baseline;
}
export function fromListing(listing: Listing): Document {
  return {
    fields: {
      name: listing.name,
      description: listing.description ?? '',
      countryId: listing.countryId ?? 0,
      cityId: listing.cityId ?? undefined,
      stateId: listing.stateId ?? undefined,
      price: Number(listing.price),
      currency: listing.currency,
      durationDays: listing.durationDays,
      tags: listing.tags,
      coverImageUrl: listing.coverImageUrl ?? undefined,
    },
    activities: listing.items.map((item) => ({
      key: String(item.id),
      id: item.id,
      dayNumber: item.dayNumber,
      title: item.title,
      description: item.description ?? '',
      location: item.location ?? undefined,
      latitude: item.latitude ?? undefined,
      longitude: item.longitude ?? undefined,
      address: item.address ?? undefined,
      startTime: item.startTime ?? undefined,
      category: item.category ?? undefined,
      imageUrls: [...item.imageUrls],
      sortOrder: item.sortOrder,
    })),
  };
}
export type EditorAction =
  | { type: 'fields'; fields: Partial<Fields> }
  | { type: 'cover'; uri: string }
  | { type: 'activity'; activity: Activity }
  | { type: 'removeActivity'; key: string }
  | { type: 'moveActivity'; key: string; offset: -1 | 1 }
  | { type: 'import'; document: Document }
  | { type: 'removeDay'; day: number }
  | { type: 'addDay' }
  | { type: 'images'; key: string; images: string[] }
  | { type: 'saved'; document?: Document }
  | { type: 'load'; document: Document };
export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const doc = state.current;
  switch (action.type) {
    case 'import':
      return { ...state, current: action.document };
    case 'moveActivity': {
      const activity = doc.activities.find((a) => a.key === action.key);
      if (!activity) return state;
      const day = doc.activities
        .filter((a) => a.dayNumber === activity.dayNumber)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      const index = day.findIndex((a) => a.key === action.key);
      const target = index + action.offset;
      if (target < 0 || target >= day.length) return state;
      [day[index], day[target]] = [day[target]!, day[index]!];
      const order = new Map(day.map((a, i) => [a.key, i]));
      return {
        ...state,
        current: {
          ...doc,
          activities: doc.activities.map((a) =>
            order.has(a.key) ? { ...a, sortOrder: order.get(a.key)! } : a,
          ),
        },
      };
    }
    case 'load':
      return editorState(action.document);
    case 'saved':
      return { ...state, baseline: snapshot(action.document ?? doc) };
    case 'fields':
      return { ...state, current: { ...doc, fields: { ...doc.fields, ...action.fields } } };
    case 'cover':
      return { ...state, current: { ...doc, coverUri: action.uri } };
    case 'activity':
      return {
        ...state,
        current: {
          ...doc,
          activities: doc.activities.some((a) => a.key === action.activity.key)
            ? doc.activities.map((a) => (a.key === action.activity.key ? action.activity : a))
            : [...doc.activities, action.activity],
        },
      };
    case 'removeActivity':
      return {
        ...state,
        current: { ...doc, activities: doc.activities.filter((a) => a.key !== action.key) },
      };
    case 'images':
      return {
        ...state,
        current: {
          ...doc,
          activities: doc.activities.map((a) =>
            a.key === action.key ? { ...a, imageUrls: [...action.images] } : a,
          ),
        },
      };
    case 'addDay':
      return (doc.fields.durationDays ?? 1) >= 30
        ? state
        : {
            ...state,
            current: {
              ...doc,
              fields: { ...doc.fields, durationDays: (doc.fields.durationDays ?? 1) + 1 },
            },
          };
    case 'removeDay': {
      const days = doc.fields.durationDays ?? 1;
      if (days <= 1 || action.day < 1 || action.day > days) return state;
      return {
        ...state,
        current: {
          ...doc,
          fields: { ...doc.fields, durationDays: days - 1 },
          coverUri: doc.coverUri,
          activities: doc.activities
            .filter((a) => a.dayNumber !== action.day)
            .map((a) => ({
              ...a,
              dayNumber: a.dayNumber > action.day ? a.dayNumber - 1 : a.dayNumber,
            })),
        },
      };
    }
  }
}
export function validationErrors(doc: Document, publish: boolean): string[] {
  const errors: string[] = [];
  if (!doc.fields.name.trim()) errors.push('Plan name is required');
  if (!doc.fields.countryId) errors.push('Please select a destination');
  const days = doc.fields.durationDays ?? 1;
  if (!Number.isInteger(days) || days < 1 || days > 30)
    errors.push('Plan duration must be between 1 and 30 days');
  if (
    !Number.isFinite(doc.fields.price ?? 0) ||
    (doc.fields.price ?? 0) < 0 ||
    (publish && (doc.fields.price ?? 0) === 0)
  )
    errors.push('Invalid budget');
  if (publish && !doc.fields.tags?.length) errors.push('Please select at least one tag');
  if (publish && !doc.activities.length) errors.push('Please add at least one activity');
  if (doc.activities.some((a) => !a.title.trim() || a.dayNumber < 1 || a.dayNumber > days))
    errors.push('Please check your activities');
  return errors;
}
