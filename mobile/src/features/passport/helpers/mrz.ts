/**
 * MRZ (machine-readable-zone) line builders — port of
 * `Component/Common/PassportMRZLines.swift`. Pure string transforms so the
 * PassportCard component can stay a thin render layer.
 */

const MRZ_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  day: '2-digit',
  month: 'short',
  year: '2-digit',
});

const FALLBACK_DATE_TOKEN = '01JAN25';

/** Vietnamese `Đ/đ` doesn't NFD-decompose to `D` + combining stroke, so map it explicitly. */
function stripDiacritics(value: string): string {
  return value.replace(/Đ/g, 'D').replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** ASCII-fold → uppercase → collapse non-alphanumerics to `<` → trim `<` → `MEMBER` if empty. */
export function mrzToken(name: string): string {
  const ascii = stripDiacritics(name).toUpperCase();
  const collapsed = ascii.replace(/[^A-Z0-9]+/g, '<');
  const trimmed = collapsed.replace(/^<+|<+$/g, '');
  return trimmed === '' ? 'MEMBER' : trimmed;
}

/** `ddMMMyy` uppercased (e.g. `01JAN25`). Unparseable/null input falls back to `01JAN25`. */
export function mrzDateToken(iso: string | null): string {
  if (!iso) return FALLBACK_DATE_TOKEN;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return FALLBACK_DATE_TOKEN;

  const parts = MRZ_DATE_FORMATTER.formatToParts(date);
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  const month = parts.find((p) => p.type === 'month')?.value ?? 'Jan';
  const year = parts.find((p) => p.type === 'year')?.value ?? '25';
  return `${day}${month}${year}`.toUpperCase();
}

function padMrz(value: string, targetLength: number): string {
  if (value.length >= targetLength) return value.slice(0, targetLength);
  return value + '<'.repeat(targetLength - value.length);
}

/** `<<ALLTIME<<{TOKEN}<<MEMBERSINCE{DATE}<<ONEPLAN TRAVEL<<PASSPORT`, padded/truncated to 64. */
export function mrzLineOne(name: string, memberSince: string | null): string {
  const raw = `<<ALLTIME<<${mrzToken(name)}<<MEMBERSINCE${mrzDateToken(memberSince)}<<ONEPLAN TRAVEL<<PASSPORT`;
  return padMrz(raw, 64);
}

/** `ISSUED{DATE}SGN` + filler `<` + `ONEPLAN TRAVEL`, truncated to 54. */
export function mrzLineTwo(memberSince: string | null): string {
  const issuedPrefix = `ISSUED${mrzDateToken(memberSince)}SGN`;
  const suffix = 'ONEPLAN TRAVEL';
  const targetLength = 54;
  const fillerCount = Math.max(1, targetLength - issuedPrefix.length - suffix.length);
  const raw = issuedPrefix + '<'.repeat(fillerCount) + suffix;
  return raw.slice(0, targetLength);
}
