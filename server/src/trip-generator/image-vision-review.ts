// Second gate: actually LOOK at the candidate photos before they are attached
// to a plan item. The title gate in image-relevance.ts can only judge the words
// around a photo; this one judges the pixels, which is the only way to catch a
// correctly-titled page whose image is a hotel lobby, a logo, or somebody
// else's city.
//
// One multimodal call reviews the whole candidate set of one plan item, so the
// model can also compare the photos against each other (near-duplicates) in the
// same pass. Any failure degrades to "keep what the title gate accepted": a
// review outage must never empty a listing.

import { Logger } from '@nestjs/common';
import sharp from 'sharp';
import { GeminiService } from '../common/gemini/gemini.service';
import { ActivityClass } from './activity-hints';
import { CollectedImage } from './place-lookup';

// Review model: cheapest capable vision model. Deliberately not the plan
// model - this is a bulk, mechanical judgement.
const REVIEW_MODEL_ID = 'gemini-2.5-flash';
const REVIEW_TIMEOUT_MS = 60_000;
// Downscaled copies are what we send: the rubric only needs to recognize the
// subject, and small JPEGs keep the request far under Vertex's 20MB body cap.
const REVIEW_MAX_EDGE = 512;
const REVIEW_JPEG_QUALITY = 70;
// Beyond this the request gets slow and the model's attention thins out.
const MAX_IMAGES_PER_REVIEW = 8;

const REVIEW_SCHEMA = {
  type: 'OBJECT',
  required: ['results'],
  properties: {
    results: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        required: ['index', 'verdict', 'reason'],
        propertyOrdering: ['index', 'verdict', 'reason'],
        properties: {
          index: {
            type: 'INTEGER',
            description: '0-based index of the image being judged',
          },
          verdict: { type: 'STRING', enum: ['PASS', 'FAIL'] },
          reason: {
            type: 'STRING',
            description:
              'If FAIL: which gate failed and why, max 12 words. If PASS: what the photo shows.',
          },
        },
      },
    },
  },
};

interface ReviewResponse {
  results?: { index?: number; verdict?: string; reason?: string }[];
}

export interface VisionReviewContext {
  itemName: string;
  placeName: string;
  destination: string;
  activity: ActivityClass | null;
}

// The rubric is the image-content-reviewer playbook, compressed: hard gates
// only, and "when in doubt, FAIL" - a missing photo costs far less than a
// photo that lies about the place.
function buildPrompt(ctx: VisionReviewContext, count: number): string {
  const activity = ctx.activity
    ? `${ctx.activity.id} (the photo should show: ${ctx.activity.hint})`
    : 'unknown';
  return `You are a strict photo editor for a travel app. Judge the ${count} image(s) above, in order, as illustrations for ONE itinerary item.

ITEM
- Activity: ${ctx.itemName}
- Venue: ${ctx.placeName || '(not specified)'}
- City / region: ${ctx.destination}
- Activity type: ${activity}

Judge every image against these HARD gates. Failing any one gate = FAIL:
1. PLACE: the image is plausibly this venue, or at least this city/region. A photo that could be anywhere in the world, or that clearly shows a different country or a famous landmark elsewhere, fails.
2. ACTIVITY: the image shows what the traveler will DO here, OR it clearly shows the named venue itself (its storefront, dining hall, stalls, terrace, the attraction it is known for). Eating -> the food, the dining room, or the eatery itself. Coffee -> drinks, the cafe space, or the cafe. Sightseeing -> the view or the site. A bar street shown by day, a food centre shown as its hall, a light-show venue shown before the show all PASS when they are recognisably this venue. What FAILS is a subject that belongs to a different kind of stop: a hotel room attached to a dinner, a bowl of noodles attached to a coffee stop, a generic skyline attached to a restaurant.
3. USABLE PHOTO: a real photograph. Logos, maps, posters, screenshots, product/equipment catalogue shots, collages with heavy text, watermark-covered stock, and AI-generated fakes all fail.
4. DIGNITY: no identifiable close-up of a child, nothing sexual, nothing that mocks the place or its people.
5. NOT A DUPLICATE: if two of these images are the same photo or near-identical crops, PASS only the best one and FAIL the other as "duplicate".

Rules: judge only what you can SEE, never assume the caption is right. When you are unsure whether an image really shows THIS PLACE, answer FAIL. When the place is clearly right but the activity is only implied (the venue rather than the dish), answer PASS. Return exactly one result per image, using its 0-based index.`;
}

async function thumbnail(img: CollectedImage): Promise<Buffer | null> {
  try {
    return await sharp(img.buffer)
      .rotate()
      .resize({
        width: REVIEW_MAX_EDGE,
        height: REVIEW_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: REVIEW_JPEG_QUALITY })
      .toBuffer();
  } catch {
    return null;
  }
}

// Returns the images the reviewer cleared, in their original order. On any
// error (quota, timeout, malformed response) it returns `images` unchanged so
// image collection degrades to the title gate instead of failing the listing.
// Which FAIL verdicts to act on. `all` is for fresh candidates. `hard` is for
// photos already on a listing: only the objective gates (junk medium,
// duplicate, wrong place, dignity) may remove them; the ACTIVITY gate is a
// judgement call the model does not repeat consistently, and re-judging it
// strips honest venue photos (Ann Siang Hill by day, listing #172).
export type VisionFailPolicy = 'all' | 'hard';

const HARD_FAIL =
  /usable|watermark|collage|logo|screenshot|poster|composite|ai.?generated|duplicate|near.?identical|\bplace\b|dignity|child|sexual/i;
const ACTIVITY_ONLY = /^activity\b|\bactivity gate\b/i;

function shouldRemove(reason: string, policy: VisionFailPolicy): boolean {
  if (policy === 'all') return true;
  if (ACTIVITY_ONLY.test(reason.trim()) && !HARD_FAIL.test(reason))
    return false;
  return HARD_FAIL.test(reason);
}

export async function reviewImagesWithVision(
  gemini: GeminiService,
  ctx: VisionReviewContext,
  images: CollectedImage[],
  logger?: Logger,
  policy: VisionFailPolicy = 'all',
): Promise<CollectedImage[]> {
  if (images.length === 0) return images;
  const batch = images.slice(0, MAX_IMAGES_PER_REVIEW);

  const thumbs: { image: CollectedImage; buffer: Buffer }[] = [];
  for (const img of batch) {
    const buffer = await thumbnail(img);
    if (buffer) thumbs.push({ image: img, buffer });
  }
  if (thumbs.length === 0) return images;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REVIEW_TIMEOUT_MS);
  let res: ReviewResponse;
  try {
    res = await gemini.generateJsonFromImages<ReviewResponse>({
      images: thumbs.map((t) => ({
        buffer: t.buffer,
        mimeType: 'image/jpeg',
      })),
      prompt: buildPrompt(ctx, thumbs.length),
      responseSchema: REVIEW_SCHEMA,
      signal: ctl.signal,
      modelId: REVIEW_MODEL_ID,
    });
  } catch (e) {
    logger?.warn(
      `Image review unavailable for "${ctx.itemName}" (${(e as Error).message.slice(0, 120)}); keeping title-verified images`,
    );
    return images;
  } finally {
    clearTimeout(timer);
  }

  const results = res.results ?? [];
  if (results.length === 0) return images;

  const failed = new Set<CollectedImage>();
  for (const r of results) {
    const at = typeof r.index === 'number' ? r.index : -1;
    const target = thumbs[at]?.image;
    if (!target) continue;
    if ((r.verdict ?? '').toUpperCase() === 'FAIL') {
      const reason = r.reason ?? 'no reason';
      if (!shouldRemove(reason, policy)) {
        logger?.log(
          `Image kept despite soft FAIL for "${ctx.itemName}": ${reason} (${target.url.slice(0, 100)})`,
        );
        continue;
      }
      failed.add(target);
      logger?.log(
        `Image rejected for "${ctx.itemName}": ${reason} (${target.url.slice(0, 100)})`,
      );
    }
  }

  return images.filter((img) => !failed.has(img));
}
