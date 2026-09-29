/**
 * Merge English duplicate marketplace listings into `en` translations of
 * their approved Vietnamese originals, then soft-delete the duplicates.
 *
 * Usage:
 *   pnpm merge:listing-dupes -- --dry-run          # print plan only (or DRY_RUN=1)
 *   pnpm merge:listing-dupes -- --only=22,24       # limit to specific VI ids
 */
import { Prisma, PrismaClient } from '@prisma/client';

type Pair = readonly [viId: number, enId: number];

const PAIRS: readonly Pair[] = [
  [22, 132],
  [24, 133],
  [25, 134],
  [26, 135],
  [29, 136],
  [31, 137],
  [32, 138],
  [33, 139],
  [34, 140],
  [35, 141],
  [36, 142],
  [38, 143],
  [39, 144],
  [43, 145],
  [44, 146],
  [46, 147],
  [47, 148],
  [48, 149],
  [50, 150],
  [51, 151],
  [55, 152],
  [67, 153],
  [69, 154],
  [71, 155],
  [72, 156],
  [74, 157],
  [75, 158],
  [76, 159],
  [77, 160],
  [78, 161],
  [79, 162],
  [80, 164],
  [81, 165],
  [82, 166],
  [88, 167],
  [84, 168],
  [85, 169],
  [73, 120],
  [42, 114],
  [130, 131],
];
/** Extra EN copies with no pair (e.g. 163 = second copy of 46): soft-delete only. */
const EXTRA_DUPLICATES_TO_DELETE: readonly number[] = [163];

const DUPLICATE_AUTHOR_ID = 1;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || process.env.DRY_RUN === '1';
const onlyArg = args.find((a) => a.startsWith('--only='));
const only = onlyArg
  ? new Set(onlyArg.slice('--only='.length).split(',').map(Number))
  : null;

const prisma = new PrismaClient();

const listingArgs = Prisma.validator<Prisma.MarketplaceListingDefaultArgs>()({
  include: {
    _count: { select: { acquisitions: true } },
    items: {
      orderBy: [{ dayNumber: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      select: { id: true, dayNumber: true, title: true, description: true },
    },
  },
});
type Listing = Prisma.MarketplaceListingGetPayload<typeof listingArgs>;
type Tx = Prisma.TransactionClient;

interface Summary {
  merged: number[];
  itemTranslated: number[];
  needsRegenerate: number[];
  skipped: string[];
  deleted: number[];
}
const summary: Summary = {
  merged: [],
  itemTranslated: [],
  needsRegenerate: [],
  skipped: [],
  deleted: [],
};

/** Returns a reason string if the EN row must not be merged/deleted, else null. */
function guardEn(en: Listing): string | null {
  if (en.deletedAt !== null) return 'already merged (deletedAt set)';
  if (en.createdById !== DUPLICATE_AUTHOR_ID)
    return `createdById=${en.createdById} !== ${DUPLICATE_AUTHOR_ID}`;
  if (en.status !== 'PENDING_REVIEW') return `status=${en.status}`;
  if (en._count.acquisitions !== 0)
    return `acquisitions=${en._count.acquisitions}`;
  return null;
}

function itemsAlign(vi: Listing, en: Listing): boolean {
  return (
    vi.items.length === en.items.length &&
    vi.items.every((item, i) => item.dayNumber === en.items[i].dayNumber)
  );
}

async function mergePair(tx: Tx, [viId, enId]: Pair): Promise<void> {
  const [vi, en] = await Promise.all([
    tx.marketplaceListing.findUnique({ where: { id: viId }, ...listingArgs }),
    tx.marketplaceListing.findUnique({ where: { id: enId }, ...listingArgs }),
  ]);
  if (!vi || !en) {
    const why = `pair vi=${viId} en=${enId}: ${!vi ? 'vi' : 'en'} listing missing`;
    console.log(`SKIP ${why}`);
    summary.skipped.push(why);
    return;
  }
  const align = itemsAlign(vi, en);
  console.log(
    `${vi.id} ${vi.name}  ⇄  ${en.id} ${en.name}  ` +
      `[vi=${vi.items.length} items, en=${en.items.length} items, ` +
      `items ${align ? 'aligned' : 'MISALIGNED'}]`,
  );

  const reason = guardEn(en);
  if (reason) {
    console.log(`  SKIP en=${en.id}: ${reason}`);
    summary.skipped.push(`vi=${vi.id} en=${en.id}: ${reason}`);
    return;
  }
  if (!align) {
    console.log(
      `  NEEDS_REGENERATE viId=${vi.id} (vi=${vi.items.length} items, en=${en.items.length} items)`,
    );
    summary.needsRegenerate.push(vi.id);
  }
  if (dryRun) {
    console.log(
      `  PLAN: set vi.sourceLocale=vi, upsert en translation, ` +
        `${align ? `upsert ${vi.items.length} item translations` : 'skip items'}, soft-delete en=${en.id}`,
    );
    summary.merged.push(vi.id);
    if (align) summary.itemTranslated.push(vi.id);
    return;
  }

  await tx.marketplaceListing.update({
    where: { id: vi.id },
    data: { sourceLocale: 'vi' },
  });
  await tx.marketplaceListingTranslation.upsert({
    where: { listingId_locale: { listingId: vi.id, locale: 'en' } },
    create: {
      listingId: vi.id,
      locale: 'en',
      name: en.name,
      description: en.description,
    },
    update: { name: en.name, description: en.description },
  });
  if (align) {
    for (const [i, viItem] of vi.items.entries()) {
      const enItem = en.items[i];
      await tx.tripPlanMarketItemTranslation.upsert({
        where: { itemId_locale: { itemId: viItem.id, locale: 'en' } },
        create: {
          itemId: viItem.id,
          locale: 'en',
          title: enItem.title,
          description: enItem.description,
        },
        update: { title: enItem.title, description: enItem.description },
      });
    }
    summary.itemTranslated.push(vi.id);
  }
  await tx.marketplaceListing.update({
    where: { id: en.id },
    data: { deletedAt: new Date() },
  });
  summary.merged.push(vi.id);
  console.log(`  MERGED vi=${vi.id} <- en=${en.id}`);
}

async function deleteExtra(tx: Tx, enId: number): Promise<void> {
  const en = await tx.marketplaceListing.findUnique({
    where: { id: enId },
    ...listingArgs,
  });
  if (!en) {
    console.log(`SKIP extra en=${enId}: listing missing`);
    summary.skipped.push(`extra en=${enId}: missing`);
    return;
  }
  const reason = guardEn(en);
  if (reason) {
    console.log(`SKIP extra en=${en.id} ${en.name}: ${reason}`);
    summary.skipped.push(`extra en=${en.id}: ${reason}`);
    return;
  }
  console.log(
    `${dryRun ? 'PLAN: soft-delete' : 'DELETE'} extra en=${en.id} ${en.name}`,
  );
  if (!dryRun) {
    await tx.marketplaceListing.update({
      where: { id: en.id },
      data: { deletedAt: new Date() },
    });
  }
  summary.deleted.push(en.id);
}

async function main(): Promise<void> {
  console.log(`merge-en-listing-duplicates ${dryRun ? '(DRY RUN)' : '(LIVE)'}`);
  const pairs = only ? PAIRS.filter(([viId]) => only.has(viId)) : PAIRS;
  for (const pair of pairs) {
    try {
      await prisma.$transaction((tx) => mergePair(tx, pair));
    } catch (err) {
      const why = `vi=${pair[0]} en=${pair[1]}: ${err instanceof Error ? err.message : String(err)}`;
      console.log(`ERROR ${why}`);
      summary.skipped.push(why);
    }
  }
  if (!only) {
    for (const enId of EXTRA_DUPLICATES_TO_DELETE) {
      try {
        await prisma.$transaction((tx) => deleteExtra(tx, enId));
      } catch (err) {
        const why = `extra en=${enId}: ${err instanceof Error ? err.message : String(err)}`;
        console.log(`ERROR ${why}`);
        summary.skipped.push(why);
      }
    }
  }
  console.log('\nSummary');
  console.log(`  merged:          ${summary.merged.length}`);
  console.log(`  item-translated: ${summary.itemTranslated.length}`);
  console.log(`  extra deleted:   ${summary.deleted.length}`);
  console.log(`  needsRegenerate: [${summary.needsRegenerate.join(', ')}]`);
  console.log(`  skipped:         [${summary.skipped.join('; ')}]`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
