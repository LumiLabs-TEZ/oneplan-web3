import { Currency, ListingTag, MarketplaceListingStatus, PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';

// Seeds a creator user + a few APPROVED marketplace listings with itineraries,
// so other accounts can browse/acquire (e.g. testing the ⚡ market unlock).
// Idempotent: re-running skips listings whose name already exists for the
// seed creator.

const prisma = new PrismaClient();

const CREATOR_EMAIL = 'seed.creator@oneplan.dev';

type SeedItem = {
  day: number;
  title: string;
  description?: string;
  location?: string;
  startTime?: string;
};

type SeedListing = {
  name: string;
  description: string;
  price: string;
  currency: Currency;
  durationDays: number;
  tags: ListingTag[];
  items: SeedItem[];
};

const LISTINGS: SeedListing[] = [
  {
    name: 'Da Lat Chill Weekend',
    description: 'Two easy days of pine forests, coffee, and night market food — no rushing.',
    price: '2500000',
    currency: Currency.VND,
    durationDays: 2,
    tags: [ListingTag.FRIENDS, ListingTag.COUPLES],
    items: [
      { day: 1, title: 'Check in near Xuan Huong Lake', startTime: '09:00', location: 'Xuan Huong Lake, Da Lat' },
      { day: 1, title: 'Lunch at Quan An Ngon', startTime: '12:00', location: 'Da Lat center' },
      { day: 1, title: 'Sunset at Robin Hill cable car', startTime: '16:30', location: 'Robin Hill' },
      { day: 1, title: 'Night market food crawl', startTime: '19:00', location: 'Da Lat Night Market' },
      { day: 2, title: 'Coffee at Horizon Coffee', startTime: '08:30', location: 'Tran Hung Dao' },
      { day: 2, title: 'Datanla waterfall + alpine coaster', startTime: '10:30', location: 'Datanla Falls' },
      { day: 2, title: 'Banh can lunch before heading home', startTime: '13:00', location: 'Tang Bat Ho street' },
    ],
  },
  {
    name: 'Bangkok Street Food 3 Days',
    description: 'Eat your way through Bangkok: markets, boat noodles, rooftop finish.',
    price: '4500',
    currency: Currency.THB,
    durationDays: 3,
    tags: [ListingTag.FRIENDS, ListingTag.SOLO],
    items: [
      { day: 1, title: 'Chatuchak market grazing', startTime: '10:00', location: 'Chatuchak Weekend Market' },
      { day: 1, title: 'Boat noodles at Victory Monument', startTime: '14:00', location: 'Victory Monument' },
      { day: 1, title: 'Chinatown night eats on Yaowarat', startTime: '18:30', location: 'Yaowarat Road' },
      { day: 2, title: 'Grand Palace + Wat Pho morning', startTime: '08:30', location: 'Grand Palace' },
      { day: 2, title: 'Tha Tien riverside lunch', startTime: '12:30', location: 'Tha Tien Pier' },
      { day: 2, title: 'Sky bar sunset', startTime: '17:30', location: 'Lebua State Tower' },
      { day: 3, title: 'Floating market half-day', startTime: '07:30', location: 'Damnoen Saduak' },
      { day: 3, title: 'Mango sticky rice farewell', startTime: '13:00', location: 'Thong Lo' },
    ],
  },
  {
    name: 'Tokyo First-Timer Essentials',
    description: 'Five days covering Shibuya, Asakusa, Ueno, and a Fuji day trip.',
    price: '85000',
    currency: Currency.JPY,
    durationDays: 5,
    tags: [ListingTag.FAMILY, ListingTag.COUPLES],
    items: [
      { day: 1, title: 'Shibuya crossing + Hachiko', startTime: '10:00', location: 'Shibuya' },
      { day: 1, title: 'Harajuku Takeshita street', startTime: '13:00', location: 'Harajuku' },
      { day: 2, title: 'Asakusa Senso-ji morning', startTime: '08:00', location: 'Asakusa' },
      { day: 2, title: 'Sumida river walk + Skytree', startTime: '11:00', location: 'Tokyo Skytree' },
      { day: 3, title: 'Ueno park & museums', startTime: '09:30', location: 'Ueno' },
      { day: 3, title: 'Ameyoko market snacks', startTime: '15:00', location: 'Ameyoko' },
      { day: 4, title: 'Fuji-Kawaguchiko day trip', startTime: '07:00', location: 'Lake Kawaguchi' },
      { day: 5, title: 'Tsukiji outer market breakfast', startTime: '08:00', location: 'Tsukiji' },
      { day: 5, title: 'Ginza stroll & souvenirs', startTime: '11:00', location: 'Ginza' },
    ],
  },
];

async function main() {
  let creator = await prisma.user.findUnique({ where: { email: CREATOR_EMAIL } });
  if (!creator) {
    creator = await prisma.user.create({
      data: {
        email: CREATOR_EMAIL,
        displayName: 'Vivian Solo',
        friendCode: randomBytes(32).toString('hex'),
      },
    });
    console.log(`Created seed creator user id=${creator.id}`);
  } else {
    console.log(`Reusing seed creator user id=${creator.id}`);
  }

  for (const seed of LISTINGS) {
    const existing = await prisma.marketplaceListing.findFirst({
      where: { createdById: creator.id, name: seed.name, deletedAt: null },
    });
    if (existing) {
      console.log(`Skipping "${seed.name}" (already exists, id=${existing.id})`);
      continue;
    }

    const listing = await prisma.marketplaceListing.create({
      data: {
        publicId: randomBytes(16).toString('hex'),
        createdById: creator.id,
        name: seed.name,
        description: seed.description,
        price: seed.price,
        currency: seed.currency,
        durationDays: seed.durationDays,
        status: MarketplaceListingStatus.APPROVED,
        tags: seed.tags,
        items: {
          create: seed.items.map((item, index) => ({
            title: item.title,
            description: item.description,
            location: item.location,
            startTime: item.startTime,
            dayNumber: item.day,
            sortOrder: index,
            imageUrls: [],
          })),
        },
      },
    });
    console.log(`Created listing "${seed.name}" id=${listing.id} (${seed.items.length} items)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
