import type { components } from '@/api/schema';

/** Note-domain DTO aliases — import these instead of reaching into `schema.d.ts`. */
export type TripNoteDto = components['schemas']['TripNoteDto'];
export type TripNoteListDto = components['schemas']['TripNoteListDto'];
export type CreateTripNoteDto = components['schemas']['CreateTripNoteDto'];
export type UpdateTripNoteDto = components['schemas']['UpdateTripNoteDto'];
