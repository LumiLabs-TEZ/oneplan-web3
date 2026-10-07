// Apple Maps place resolution via DuckDuckGo local search. DDG uses Apple
// Maps as its places data provider, so its `local.js` results carry the
// Apple place id (decimal). That id converts to the hex `place-id` used by
// maps.apple.com/place URLs: 'I' + BigInt(id).toString(16).toUpperCase().
// Verified working without any Apple Developer token.

import { createHash } from 'node:crypto';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// A resolved place, normalized from a DuckDuckGo local result. IMPORTANT:
// the DDG `id` field is the id of whatever engine sourced the row (Tripadvisor,
// Yelp, ...), NOT the Apple Maps place id. The real Apple id lives in
// `provider_meta.apple.place_id`; using the wrong one builds a place-id URL
// that 404s on Apple Maps. `mapkitName`/`mapkitAddress` are Apple's own
// canonical strings for the place.
export interface ApplePlace {
  name: string;
  address: string;
  city: string;
  coordinates: { latitude: number; longitude: number };
  applePlaceId: string | null;
  mapkitName: string;
}

interface DdgLocalResult {
  id?: string | number;
  name?: string;
  address?: string;
  city?: string;
  mapkit_name?: string;
  mapkit_address?: string;
  coordinates?: { latitude: number; longitude: number };
  provider_meta?: { apple?: { place_id?: string } };
}

function toApplePlace(res: DdgLocalResult): ApplePlace | null {
  if (!res?.coordinates || !res.address) return null;
  const mapkitName = (res.mapkit_name || res.name || '').trim();
  if (!mapkitName) return null;
  return {
    name: mapkitName,
    address: (res.mapkit_address || res.address || '').trim(),
    city: (res.city || '').trim(),
    coordinates: res.coordinates,
    applePlaceId: res.provider_meta?.apple?.place_id ?? null,
    mapkitName,
  };
}

export function quotePlus(s: string): string {
  return encodeURIComponent(s).replace(/%20/g, '+');
}

export async function fetchWithTimeout(
  url: string,
  opts: RequestInit = {},
  ms = 15000,
): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function fetchDdgVqd(url: string): Promise<string | null> {
  const r = await fetchWithTimeout(url, { headers: { 'User-Agent': UA } });
  const html = await r.text();
  const m = html.match(/vqd=["']?([\d-]+)/);
  return m ? m[1] : null;
}

// Low-level DDG local search. Returns up to `limit` normalized candidates
// (not just the first, so the caller can skip a wrong-city top hit and pick
// the geographically correct one).
export async function lookupApplePlaces(
  query: string,
  limit = 6,
): Promise<ApplePlace[]> {
  // Same host as image search: when DDG is unreachable/blocking this IP,
  // every lookup would burn two 15s timeouts before the Nominatim fallback
  // (one Ubud plan spent 50 minutes resolving places). Skip straight to the
  // fallback while the cooldown is open.
  if (ddgIsBlocked()) return [];
  try {
    const vqd = await fetchDdgVqd(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iaxm=maps`,
    );
    if (!vqd) return [];
    const js = await fetchWithTimeout(
      `https://duckduckgo.com/local.js?q=${encodeURIComponent(query)}&tg=maps_places&rt=D&mkexp=b&wiki_info=1&is_requery=1&location_type=geoip&vqd=${vqd}`,
      { headers: { 'User-Agent': UA, Referer: 'https://duckduckgo.com/' } },
    );
    if (!js.ok) return [];
    const data = (await js.json()) as { results?: DdgLocalResult[] };
    return (data.results ?? [])
      .slice(0, limit)
      .map(toApplePlace)
      .filter((p): p is ApplePlace => p !== null);
  } catch (e) {
    if (
      e instanceof TypeError ||
      /fetch failed|aborted|ECONNRESET|ENOTFOUND|ETIMEDOUT/i.test(
        (e as Error).message ?? '',
      )
    ) {
      markDdgBlocked();
    }
    return [];
  }
}

export async function lookupApplePlace(
  query: string,
): Promise<ApplePlace | null> {
  return (await lookupApplePlaces(query, 1))[0] ?? null;
}

/* ------------------------- Match validation ------------------------- */
// A place is only accepted when it is (a) in the destination city and (b) a
// clear name or street-address match. Generic venue words ("bun", "bo",
// "cafe", "market"...) do not count as a name match, so a "Bún bò" stall in
// Hue is not matched to a "Bún bò" restaurant in Ho Chi Minh City.

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip Vietnamese/Latin diacritics
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter((t) => t.length >= 2);
}

// Common venue / cuisine words that must not, on their own, make two places
// "the same". Keeps a match anchored on a distinctive part of the name.
const GENERIC_NAME_TOKENS = new Set([
  'quan',
  'nha',
  'hang',
  'cua',
  'tiem',
  'restaurant',
  'nha hang',
  'cafe',
  'coffee',
  'bar',
  'pub',
  'bia',
  'beer',
  'market',
  'cho',
  'food',
  'uong',
  'pho',
  'bun',
  'com',
  'banh',
  'tra',
  'tea',
  'sua',
  'hotel',
  'inn',
  'resort',
  'villa',
  'homestay',
  'museum',
  'park',
  'beach',
  'bai',
  'cau',
  'chua',
  'den',
  'lang',
  'house',
  'the',
  'and',
  'garden',
  'club',
  'shop',
  'store',
]);

// Geographic filler that should not be treated as a distinctive destination
// token when checking the city.
const GEO_STOPWORDS = new Set([
  'thanh',
  'pho',
  'tinh',
  'city',
  'province',
  'district',
  'quan',
  'phuong',
  'xa',
  'town',
  'vietnam',
  'viet',
  'nam',
  'vn',
]);

function significantTokens(s: string, stop: Set<string>): string[] {
  return tokenize(s).filter((t) => t.length >= 3 && !stop.has(t));
}

// First standalone street number in an address (e.g. "441", "12A").
function houseNumber(address: string): string | null {
  const m = address.match(/\b(\d{1,4}[a-z]?)\b/i);
  return m ? m[1].toLowerCase() : null;
}

// Distinctive name tokens, excluding generic venue words AND the destination's
// own tokens, so a venue merely NAMED after the city (e.g. "Nhà hàng Quảng
// Ngãi") does not count as a match to some other city-named venue.
function nameMatches(
  resultName: string,
  placeName: string,
  extraStop: Set<string> = new Set(),
): boolean {
  const want = significantTokens(placeName, GENERIC_NAME_TOKENS).filter(
    (t) => !extraStop.has(t),
  );
  if (want.length === 0) return false;
  const got = new Set(tokenize(resultName));
  return want.some((t) => got.has(t));
}

// Address match needs the same street number AND a shared street word, so a
// different venue on the same street does not pass as a match.
function addressMatches(resultAddress: string, address: string): boolean {
  const hn = houseNumber(address);
  if (!hn) return false;
  const got = new Set(tokenize(resultAddress));
  if (!got.has(hn)) return false;
  return tokenize(address).some((t) => t.length >= 4 && got.has(t));
}

// The candidate must sit in the destination city, so a same-named place in a
// different city is rejected. Falls open only when the destination carries no
// distinctive token (very rare).
function cityMatches(place: ApplePlace, destination: string): boolean {
  const destTokens = significantTokens(destination, GEO_STOPWORDS);
  if (destTokens.length === 0) return true;
  const hay = new Set([...tokenize(place.city), ...tokenize(place.address)]);
  return destTokens.some((t) => hay.has(t));
}

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface ResolvedPlace {
  place: ApplePlace;
  byAddress: boolean;
}

// Great-circle distance in km. Used to enforce that every place in a plan sits
// in (or right around) the destination city.
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// A city plus its outskirts. A place farther than this from the destination
// center is treated as a different city and rejected.
export const MAX_CITY_RADIUS_KM = 60;

// OpenStreetMap Nominatim geocode. Covers cities AND landmarks/beaches/
// mountains that DDG's business-only local search misses. Returns coordinates
// plus the matched name. Returns null on failure.
export async function nominatimSearch(
  query: string,
): Promise<{ coordinates: LatLng; name: string } | null> {
  const q = (query || '').trim();
  if (!q) return null;
  try {
    const r = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
      {
        headers: {
          'User-Agent':
            'OnePlanTripGenerator/1.0 (https://oneplan.space; admin@oneplan.space)',
        },
      },
      12000,
    );
    if (!r.ok) return null;
    const arr = (await r.json()) as {
      lat?: string;
      lon?: string;
      display_name?: string;
      name?: string;
    }[];
    const top = arr?.[0];
    if (!top?.lat || !top?.lon) return null;
    const latitude = parseFloat(top.lat);
    const longitude = parseFloat(top.lon);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
    const name = top.name || (top.display_name || '').split(',')[0] || '';
    return { coordinates: { latitude, longitude }, name };
  } catch {
    return null;
  }
}

// Center coordinate for the destination, used as the reference to reject
// out-of-city places.
export async function geocodeCity(destination: string): Promise<LatLng | null> {
  return (await nominatimSearch(destination))?.coordinates ?? null;
}

// Resolve a place to a real, in-city location. Same-city is enforced by
// distance to `ref` (the destination center), so a place merely NAMED after the
// destination but sitting in another city (e.g. a "Quang Ngai" eatery in Ho Chi
// Minh City for a Quang Ngai plan) is rejected. Tries several DDG query
// variants (original name, ASCII-folded name, and the English hint, each with
// address / destination), short-circuiting on the first trustworthy in-city
// match. Falls back to a Nominatim geocode for landmarks/beaches/mountains that
// DDG's business search misses. Returns null when nothing in-city is found.
export async function resolvePlace(
  placeName: string,
  address: string,
  destination = '',
  ref: LatLng | null = null,
  englishHint = '',
): Promise<ResolvedPlace | null> {
  const name = (placeName || '').trim();
  const addr = (address || '').trim();
  const dest = (destination || '').trim();
  const hint = (englishHint || '').trim();

  // Matching considers both the original name and the English hint (they
  // usually share a distinctive token, e.g. "Thien"). City-name tokens are
  // excluded ONLY when there is no `ref`: with a `ref`, distance already
  // guarantees same-city, so a city-named place like "Chợ Quảng Ngãi" (the
  // city market) is allowed to match on its city tokens.
  const extraStop = ref ? new Set<string>() : new Set(tokenize(dest));
  const nameMatch = (resultName: string) =>
    nameMatches(resultName, name, extraStop) ||
    (hint ? nameMatches(resultName, hint, extraStop) : false);

  const inCity = (p: ApplePlace): boolean =>
    ref
      ? haversineKm(ref, p.coordinates) <= MAX_CITY_RADIUS_KM
      : cityMatches(p, dest);

  // DDG query variants, most specific first. ASCII-folding the name helps
  // because Apple/DDG often index the Latin form ("Thien An" resolves where
  // "Thiên Ấn" does not).
  const ascii = normalize(name);
  const nameForms = [...new Set([name, ascii, hint].filter(Boolean))];
  const queries: { q: string; requireName: boolean }[] = [];
  for (const nm of nameForms) {
    if (addr) queries.push({ q: `${nm} ${addr}`, requireName: false });
    if (dest) queries.push({ q: `${nm} ${dest}`, requireName: true });
  }
  if (houseNumber(addr)) queries.push({ q: addr, requireName: false });

  for (const { q, requireName } of queries) {
    const cands = await lookupApplePlaces(q);
    const hit = cands.find(
      (p) =>
        inCity(p) &&
        (nameMatch(p.name) ||
          (!requireName && addressMatches(p.address, addr))),
    );
    if (hit) {
      return { place: hit, byAddress: !nameMatch(hit.name) };
    }
  }

  // Nominatim fallback for real places DDG's business search does not carry.
  // Only accept when it lands inside the city radius (needs a ref).
  if (ref) {
    for (const q of [
      hint ? `${hint}, ${dest}` : '',
      name ? `${name}, ${dest}` : '',
    ]) {
      if (!q) continue;
      const g = await nominatimSearch(q);
      if (g && haversineKm(ref, g.coordinates) <= MAX_CITY_RADIUS_KM) {
        return {
          place: {
            name: g.name || name,
            mapkitName: g.name || name,
            address: addr,
            city: '',
            coordinates: g.coordinates,
            applePlaceId: null,
          },
          byAddress: false,
        };
      }
    }
  }

  return null;
}

// A labeled pin at exact coordinates. This CANNOT 404: unlike a
// place?place-id= URL (which dies when the id is wrong or stale), Apple Maps
// always renders a coordinate. Coordinates come from Apple's own data via the
// DDG result, so the pin lands on the real place.
export function appleMapsLink(place: ApplePlace): string {
  const { latitude, longitude } = place.coordinates;
  return (
    `https://maps.apple.com/?ll=${latitude}%2C${longitude}` +
    `&q=${quotePlus(place.mapkitName || place.name)}`
  );
}

// Fallback when we could not confidently resolve a place. Prefer the address
// (e.g. "441 Bui Thi Xuan, ...") over the venue name, since Apple Maps
// reliably resolves a real address but often fails on an obscure venue name.
export function appleMapsSearchLink(query: string): string {
  return `https://maps.apple.com/?q=${quotePlus(query)}`;
}

/* ------------------------------ Images ------------------------------ */

export interface ImageResult {
  url: string;
  // Best-effort caption/title used to check the image actually depicts the
  // place (DDG gives a real title; Bing falls back to the URL filename).
  title: string;
  // Pixel size when the search engine reports it (DDG does); used to reject
  // small/low-quality images before wasting a download.
  width?: number;
  height?: number;
}

// Shared across all items of one listing so two plans at the same venue can
// never end up with the same photo (dedup by URL and by content hash).
export interface UsedImages {
  urls: Set<string>;
  hashes: Set<string>;
}

// Distinctive tokens of a place name, for checking that an image is really of
// this place. Drops generic venue words so a random "restaurant" photo does
// not pass.
export function imageRelevanceTokens(placeName: string): string[] {
  return [...new Set(significantTokens(placeName, GENERIC_NAME_TOKENS))];
}

// Same, for a destination string like "Cao Bằng, Cao Bằng, Vietnam": drops the
// administrative filler and the repeated city name, so the caller is left with
// the tokens that actually identify the place ("cao", "bang").
export function destinationRelevanceTokens(destination: string): string[] {
  return [
    ...new Set(
      significantTokens(destination, GENERIC_NAME_TOKENS).filter(
        (t) => !GEO_STOPWORDS.has(t),
      ),
    ),
  ];
}

function titleFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const last = decodeURIComponent(path.split('/').pop() ?? '');
    return last.replace(/\.[a-z0-9]+$/i, '').replace(/[-_+]/g, ' ');
  } catch {
    return '';
  }
}

// DuckDuckGo refuses bursts: with several plan items searched concurrently
// it answers the vqd page with a bot challenge and `i.js` with 403 after the
// first couple of queries (reproduced 2026-09 on the Singapore listing: 17 of
// 19 items came back with zero photos). Image searches are therefore
// serialized through one queue with a minimum gap, and a refusal is retried
// with backoff instead of silently yielding an empty listing.
const DDG_MIN_GAP_MS = 1200;
const DDG_RETRY_DELAYS_MS = [2500, 6000];
// Once a query has exhausted its retries the IP is blocked for a while; stop
// paying ~10s of retries per query and let the other providers carry the
// listing until the cooldown ends.
const DDG_COOLDOWN_MS = 10 * 60_000;

let ddgQueue: Promise<unknown> = Promise.resolve();
let ddgLastAt = 0;
let ddgBlockedUntil = 0;

export function ddgIsBlocked(now = Date.now()): boolean {
  return now < ddgBlockedUntil;
}

export function markDdgBlocked(): void {
  ddgBlockedUntil = Date.now() + DDG_COOLDOWN_MS;
}

// Test hook.
export function resetDdgState(): void {
  ddgBlockedUntil = 0;
  ddgLastAt = 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Run `fn` after every earlier DDG call has finished and at least
// DDG_MIN_GAP_MS since the previous one started.
export function ddgSerialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = ddgQueue.then(async () => {
    const wait = ddgLastAt + DDG_MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    ddgLastAt = Date.now();
    return fn();
  });
  ddgQueue = run.catch(() => undefined);
  return run;
}

class DdgRefusedError extends Error {}

async function ddgImageUrlsOnce(query: string): Promise<ImageResult[]> {
  const vqd = await fetchDdgVqd(
    `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
  );
  if (!vqd) throw new DdgRefusedError('no vqd (bot challenge)');
  const js = await fetchWithTimeout(
    `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&f=,,,&p=1`,
    { headers: { 'User-Agent': UA, Referer: 'https://duckduckgo.com/' } },
  );
  if (js.status === 403 || js.status === 429) {
    throw new DdgRefusedError(`i.js ${js.status}`);
  }
  if (!js.ok) return [];
  const data = (await js.json()) as {
    results?: {
      image?: string;
      title?: string;
      width?: number;
      height?: number;
    }[];
  };
  return (data.results ?? [])
    .filter((x) => x.image)
    .map((x) => ({
      url: x.image as string,
      title: x.title ?? '',
      width: x.width,
      height: x.height,
    }));
}

export async function ddgImageUrls(
  query: string,
  onRefused?: (attempt: number, reason: string) => void,
): Promise<ImageResult[]> {
  if (ddgIsBlocked()) {
    onRefused?.(0, 'skipped: cooldown after earlier refusals');
    return [];
  }
  for (let attempt = 0; ; attempt++) {
    try {
      return await ddgSerialized(() => ddgImageUrlsOnce(query));
    } catch (e) {
      // A network-level failure (DNS, connection refused, 15s abort) means
      // DDG is unreachable from this host: retrying per query would cost the
      // whole timeout budget 3x per item (Bangkok #174 took 8 minutes that
      // way). Treat it like a refusal so the cooldown kicks in.
      const network =
        e instanceof TypeError ||
        /fetch failed|aborted|ECONNRESET|ENOTFOUND|ETIMEDOUT/i.test(
          (e as Error).message ?? '',
        );
      if (!(e instanceof DdgRefusedError) && !network) throw e;
      onRefused?.(attempt + 1, (e as Error).message.slice(0, 60));
      if (network) {
        markDdgBlocked();
        return [];
      }
      const delay = DDG_RETRY_DELAYS_MS[attempt];
      if (delay === undefined) {
        markDdgBlocked();
        return [];
      }
      await sleep(delay);
    }
  }
}

// Bing's result grid carries one JSON blob per image in the anchor's `m`
// attribute: `murl` (full-size image), `purl` (page) and `t` (page title).
// The title is what lets the relevance gate judge the photo; earlier this
// parser kept only `murl` and derived a "title" from the filename, which the
// gate almost always rated `unverified`, so the Bing fallback never produced
// a photo. Exported for tests.
export function parseBingImageResults(rawHtml: string): ImageResult[] {
  const html = rawHtml.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const seen = new Set<string>();
  const out: ImageResult[] = [];
  for (const m of html.matchAll(/ m="(\{.*?\})"/g)) {
    let parsed: { murl?: string; t?: string; purl?: string };
    try {
      parsed = JSON.parse(m[1]) as typeof parsed;
    } catch {
      continue;
    }
    const url = parsed.murl;
    if (!url || !/^https?:\/\//.test(url) || seen.has(url)) continue;
    seen.add(url);
    const title = (parsed.t ?? '').trim() || titleFromUrl(url);
    out.push({ url, title });
  }
  if (out.length > 0) return out;
  // Markup changed: fall back to the bare murl scan so we still get URLs.
  for (const m of html.matchAll(/"murl":"(https?:\/\/[^"]+?)"/g)) {
    const url = m[1];
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ url, title: titleFromUrl(url) });
  }
  return out;
}

export async function bingImageUrls(query: string): Promise<ImageResult[]> {
  const r = await fetchWithTimeout(
    `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1`,
    { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.8' } },
  );
  return parseBingImageResults(await r.text());
}

// Wikimedia Commons: free, keyless, stable, and every file is titled with
// what it shows ("Maxwell Food Centre, 2024 (02).jpg"), which is exactly what
// the relevance gate needs. Weak on hawker dishes, strong on venues and
// landmarks. Commons asks for an identifying User-Agent.
const WIKIMEDIA_UA =
  'OnePlanTripGenerator/1.0 (https://oneplan.space; dev@lumilabs.space)';
const WIKIMEDIA_THUMB_WIDTH = 1600;

interface CommonsPage {
  title?: string;
  imageinfo?: {
    url?: string;
    thumburl?: string;
    width?: number;
    height?: number;
    mime?: string;
  }[];
}

export function parseWikimediaResults(data: {
  query?: { pages?: Record<string, CommonsPage> };
}): ImageResult[] {
  const pages = Object.values(data.query?.pages ?? {});
  const out: ImageResult[] = [];
  for (const p of pages) {
    const info = p.imageinfo?.[0];
    if (!info) continue;
    const mime = (info.mime ?? '').toLowerCase();
    if (!/^image\/(jpeg|png|webp)$/.test(mime)) continue;
    const url = info.thumburl || info.url;
    if (!url) continue;
    const title = (p.title ?? '')
      .replace(/^File:/, '')
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[_]/g, ' ');
    out.push({ url, title, width: info.width, height: info.height });
  }
  return out;
}

// Commons search is AND-of-all-terms, so the long "<venue> <City, District,
// Country>" query that suits web search finds nothing there. Keep the venue
// plus the first destination segment ("Satay by the Bay Singapore").
export function compactCommonsQuery(query: string): string {
  return query.split(',')[0].replace(/["]/g, '').trim();
}

export async function wikimediaImageUrls(
  query: string,
  limit = 12,
): Promise<ImageResult[]> {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: compactCommonsQuery(query),
    gsrnamespace: '6',
    gsrlimit: String(limit),
    prop: 'imageinfo',
    iiprop: 'url|size|mime',
    iiurlwidth: String(WIKIMEDIA_THUMB_WIDTH),
    format: 'json',
  });
  const r = await fetchWithTimeout(
    `https://commons.wikimedia.org/w/api.php?${params.toString()}`,
    { headers: { 'User-Agent': WIKIMEDIA_UA } },
  );
  if (!r.ok) return [];
  return parseWikimediaResults(
    (await r.json()) as Parameters<typeof parseWikimediaResults>[0],
  );
}

// Google Custom Search JSON API (image mode). Optional: only used when
// GOOGLE_CSE_KEY + GOOGLE_CSE_CX are set. Pricing as published on
// developers.google.com/custom-search/v1/overview (checked 2026-09-22):
// 100 queries/day free, then $5 per 1000, max 10k/day.
export async function googleCseImageUrls(
  query: string,
): Promise<ImageResult[]> {
  const key = process.env.GOOGLE_CSE_KEY;
  const cx = process.env.GOOGLE_CSE_CX;
  if (!key || !cx) return [];
  const params = new URLSearchParams({
    key,
    cx,
    q: query,
    searchType: 'image',
    num: '10',
    imgSize: 'large',
    safe: 'active',
  });
  const r = await fetchWithTimeout(
    `https://www.googleapis.com/customsearch/v1?${params.toString()}`,
  );
  if (!r.ok) return [];
  const data = (await r.json()) as {
    items?: {
      link?: string;
      title?: string;
      image?: { width?: number; height?: number };
    }[];
  };
  return (data.items ?? [])
    .filter((x) => x.link)
    .map((x) => ({
      url: x.link as string,
      title: x.title ?? '',
      width: x.image?.width,
      height: x.image?.height,
    }));
}

export interface DownloadedImage {
  buffer: Buffer;
  ext: string;
  // Normalized MIME derived from the extension, so callers uploading to
  // storage (which only allows jpeg/png/webp) get a clean content type.
  contentType: string;
}

// A downloaded image plus where it came from, so a later review pass (and the
// logs) can say WHY a photo was kept or dropped.
export interface CollectedImage extends DownloadedImage {
  url: string;
  title: string;
}

const EXT_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
};

export async function downloadImage(
  url: string,
): Promise<DownloadedImage | null> {
  try {
    const r = await fetchWithTimeout(
      url,
      { headers: { 'User-Agent': UA } },
      20000,
    );
    if (!r.ok) return null;
    const ct = (r.headers.get('content-type') ?? '').toLowerCase();
    if (!ct.startsWith('image/')) return null;
    const buffer = Buffer.from(await r.arrayBuffer());
    if (buffer.length < 8 * 1024) return null;
    const ext = ct.includes('png')
      ? '.png'
      : ct.includes('webp')
        ? '.webp'
        : ct.includes('gif')
          ? '.gif'
          : '.jpg';
    return { buffer, ext, contentType: EXT_MIME[ext] };
  } catch {
    return null;
  }
}

// Reject images the search engine already reports as small or extreme-ratio:
// thumbnails, banners and sprites are never good listing photos.
const MIN_SOURCE_WIDTH = 640;
const MIN_SOURCE_HEIGHT = 480;
const MIN_IMAGE_BYTES = 25 * 1024;

// Stock-photo hosts: every result is a watermarked comp image, rejected by
// the vision review 100% of the time. Skip them before download.
const STOCK_HOSTS =
  /(^|\.)(alamy|dreamstime|istockphoto|shutterstock|gettyimages|123rf|depositphotos|adobe|stock\.adobe|bigstockphoto|canstockphoto|vectorstock|freepik|pond5|agefotostock|colourbox)\.com$/i;

export function isStockHost(url: string): boolean {
  try {
    return STOCK_HOSTS.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function acceptableSize(r: ImageResult): boolean {
  if (r.width && r.width < MIN_SOURCE_WIDTH) return false;
  if (r.height && r.height < MIN_SOURCE_HEIGHT) return false;
  if (r.width && r.height) {
    const ratio = r.width / r.height;
    if (ratio > 3 || ratio < 1 / 3) return false; // banner / strip crops
  }
  return true;
}

// Download up to `max` usable images for a query (DDG first, Bing fallback).
// `accept` is the relevance gate: a search result whose title does not prove
// it depicts this place AND this activity is dropped before it is downloaded,
// so a random hotel room is never attached to a dinner. It returns fewer (or
// zero) images rather than guessing.
// `used` (optional) is shared across the items of one listing: URLs and
// content hashes already picked are skipped, so two plans at the same venue
// get DIFFERENT photos instead of the same top results.
export interface CollectImagesStats {
  wikimediaResults: number;
  googleResults: number;
  ddgResults: number;
  bingResults: number;
  candidates: number;
  ddgRefusals: string[];
  errors: string[];
}

export async function collectImages(
  query: string,
  max = 5,
  accept: (r: ImageResult) => boolean = () => true,
  used?: UsedImages,
  stats?: CollectImagesStats,
): Promise<CollectedImage[]> {
  // Provider order: the reliable, titled sources first (Commons, then Google
  // when a key is configured), the scrape-based ones after. DDG rate-limits
  // datacenter IPs after a few dozen queries and Bing serves decoy results to
  // cookie-less clients, so neither may be the only thing a listing relies on.
  let results: ImageResult[] = [];
  try {
    const wiki = await wikimediaImageUrls(query);
    if (stats) stats.wikimediaResults += wiki.length;
    results = results.concat(wiki);
  } catch (e) {
    stats?.errors.push(`wikimedia: ${(e as Error).message.slice(0, 80)}`);
  }
  if (results.length < max * 2) {
    try {
      const google = await googleCseImageUrls(query);
      if (stats) stats.googleResults += google.length;
      results = results.concat(google);
    } catch (e) {
      stats?.errors.push(`google: ${(e as Error).message.slice(0, 80)}`);
    }
  }
  if (results.length < max * 3) {
    try {
      const ddg = await ddgImageUrls(query, (attempt, reason) =>
        stats?.ddgRefusals.push(`#${attempt} ${reason}`),
      );
      if (stats) stats.ddgResults += ddg.length;
      results = results.concat(ddg);
    } catch (e) {
      stats?.errors.push(`ddg: ${(e as Error).message.slice(0, 80)}`);
    }
  }
  if (results.length < max * 3) {
    try {
      const bing = await bingImageUrls(query);
      if (stats) stats.bingResults += bing.length;
      results = results.concat(bing);
    } catch (e) {
      stats?.errors.push(`bing: ${(e as Error).message.slice(0, 80)}`);
    }
  }

  const candidates = results.filter(
    (r) => !isStockHost(r.url) && acceptableSize(r) && accept(r),
  );
  if (stats) stats.candidates += candidates.length;

  const seen = new Set<string>();
  const images: CollectedImage[] = [];
  for (const r of candidates) {
    if (images.length >= max) break;
    if (seen.has(r.url) || used?.urls.has(r.url)) continue;
    seen.add(r.url);
    used?.urls.add(r.url); // claim before the await so concurrent items skip it
    const img = await downloadImage(r.url);
    if (!img) continue;
    if (img.buffer.length < MIN_IMAGE_BYTES) continue; // icons / tiny thumbs
    const hash = createHash('md5').update(img.buffer).digest('hex');
    if (used?.hashes.has(hash)) continue; // same photo hosted on another URL
    used?.hashes.add(hash);
    images.push({ ...img, url: r.url, title: r.title });
  }
  return images;
}
