/**
 * Add/Edit-note form rules — mirrors iOS `AddNoteSheet`: trim title + body before saving, disable
 * Save until the trimmed title is non-empty, and omit an empty body on create (server stores
 * `null`) but send an explicit `''` on edit so a cleared body actually clears the stored value.
 */
import type { CreateTripNoteDto, UpdateTripNoteDto } from '../types';

export interface NormalizedNoteInput {
  title: string;
  body: string;
}

/** Trims both fields. `body` may be `''` — callers decide whether to omit it. */
export function normalizeNoteInput(title: string, body: string): NormalizedNoteInput {
  return { title: title.trim(), body: body.trim() };
}

/** Save is only enabled once the trimmed title is non-empty. */
export function canSaveNote(title: string): boolean {
  return title.trim().length > 0;
}

/** Empty body is omitted entirely on create (server default is `null`). */
export function toCreateBody(title: string, body: string, isDone = false): CreateTripNoteDto {
  const normalized = normalizeNoteInput(title, body);
  return {
    title: normalized.title,
    isDone,
    ...(normalized.body.length > 0 ? { body: normalized.body } : {}),
  };
}

/** Empty body is sent as `''` on edit so an existing body can be cleared. */
export function toUpdateBody(title: string, body: string, isDone: boolean): UpdateTripNoteDto {
  const normalized = normalizeNoteInput(title, body);
  return {
    title: normalized.title,
    body: normalized.body,
    isDone,
  };
}

/** `dd/MM` in local time. `new Date(iso)` tolerates Prisma's fractional-second timestamps. */
export function noteDateLabel(iso: string): string {
  const date = new Date(iso);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}
