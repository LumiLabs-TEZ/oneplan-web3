import { randomBytes } from 'crypto';
import {
  ExpenseCategory,
  InviteStatus,
  PlanScope,
  PrismaClient,
  TripStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

const OWNER_EMAIL = 'owner@example.com';

const FAKE_NAMES = [
  'Hyydesi',
  'Shin',
  'Luna',
  'Marco',
  'Nadia',
  'Oscar',
  'Priya',
  'Rosa',
];

// Expenses each payer creates; split equally among ALL members. From the
// owner's POV this yields a receivable from every other member (expenses the
// owner paid) AND a payable to every other member (expenses they paid).
const EXPENSE_TEMPLATES: {
  name: string;
  amount: number;
  category: ExpenseCategory;
}[] = [
  { name: 'Lẩu bò Nhà Gỗ', amount: 1_200_000, category: ExpenseCategory.FOOD },
  { name: 'Homestay lần 2', amount: 900_000, category: ExpenseCategory.STAY },
  { name: 'Vé Datanla', amount: 450_000, category: ExpenseCategory.TICKET },
  { name: 'Taxi sân bay', amount: 350_000, category: ExpenseCategory.TRANSPORT },
];

function parseArgs(): { members: number } {
  const args = process.argv.slice(2);
  let members = 4;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--members' && args[i + 1]) {
      members = parseInt(args[i + 1], 10);
    }
  }
  return { members: Math.max(1, Math.min(members, FAKE_NAMES.length)) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

async function main() {
  const { members } = parseArgs();
  console.log(`Seeding settlement-test trip with ${members} fake member(s)...`);

  const owner = await prisma.user.findUnique({
    where: { email: OWNER_EMAIL },
  });
  if (!owner) {
    console.error(
      `Owner "${OWNER_EMAIL}" not found. Log into the app once (against this DB) so the user exists, then re-run.`,
    );
    process.exit(1);
  }
  console.log(`Owner: ${owner.displayName ?? owner.email} (id ${owner.id})`);

  // Create fake users.
  const profiles = FAKE_NAMES.slice(0, members).map((name) => ({
    email: `${name.toLowerCase()}@seed.test`,
    displayName: name,
  }));
  await prisma.user.createMany({ data: profiles, skipDuplicates: true });
  const fakeUsers = await prisma.user.findMany({
    where: { email: { in: profiles.map((p) => p.email) } },
  });
  const allMembers = [owner, ...fakeUsers];
  console.log(
    `Members: ${allMembers.map((m) => m.displayName ?? m.email).join(', ')}`,
  );

  // Idempotent re-seed: drop prior settlement-test trips owned by this user.
  const prior = await prisma.trip.findMany({
    where: { name: 'Settlement Test Trip', createdById: owner.id },
    select: { id: true },
  });
  if (prior.length > 0) {
    await prisma.trip.deleteMany({
      where: { id: { in: prior.map((t) => t.id) } },
    });
    console.log(`Removed ${prior.length} prior settlement-test trip(s).`);
  }

  const start = new Date();
  start.setDate(start.getDate() - 3);
  const end = new Date();

  const trip = await prisma.trip.create({
    data: {
      name: 'Settlement Test Trip',
      status: TripStatus.ONGOING,
      startDate: start,
      endDate: end,
      inviteCode: randomBytes(16).toString('hex'),
      createdById: owner.id,
      // currency defaults to VND
    },
  });
  console.log(`Created trip "${trip.name}" (id ${trip.id}, ONGOING)`);

  const now = new Date();
  await prisma.tripMember.createMany({
    data: allMembers.map((u) => ({
      tripId: trip.id,
      userId: u.id,
      inviteStatus: InviteStatus.ACCEPTED,
      joinedAt: now,
      createdAt: now,
    })),
    skipDuplicates: true,
  });

  // Budgets: two group budgets, each member deposits an equal share (isPaid).
  const budgetSpecs = [
    { name: 'Group fund', amount: 2_000_000, category: ExpenseCategory.OTHER },
    { name: 'Accommodation', amount: 3_000_000, category: ExpenseCategory.STAY },
  ];
  for (const spec of budgetSpecs) {
    const perPerson = round2(spec.amount / allMembers.length);
    await prisma.budget.create({
      data: {
        tripId: trip.id,
        name: spec.name,
        amount: spec.amount,
        perPersonAmount: perPerson,
        scope: PlanScope.GROUP,
        category: spec.category,
        payments: {
          create: allMembers.map((u) => ({
            userId: u.id,
            amount: perPerson,
            isPaid: true,
            paidAt: now,
          })),
        },
      },
    });
  }
  console.log(`Created ${budgetSpecs.length} budget(s) with deposits.`);

  // Expenses: each member pays a couple, split equally among everyone.
  let expenseCount = 0;
  let shareCount = 0;
  for (let p = 0; p < allMembers.length; p++) {
    const payer = allMembers[p];
    // Owner pays 2 templates; each fake pays 1 (rotated) to keep it varied.
    const templates =
      payer.id === owner.id
        ? EXPENSE_TEMPLATES
        : [EXPENSE_TEMPLATES[p % EXPENSE_TEMPLATES.length]];

    for (const tpl of templates) {
      const perShare = round2(tpl.amount / allMembers.length);
      const expenseDate = new Date(start);
      expenseDate.setHours(9 + expenseCount, 0, 0, 0);

      await prisma.expense.create({
        data: {
          tripId: trip.id,
          paidById: payer.id,
          name: tpl.name,
          amount: tpl.amount,
          category: tpl.category,
          expenseDate,
          shares: {
            create: allMembers.map((u) => ({
              userId: u.id,
              shareAmount: perShare,
              isSettled: false,
            })),
          },
        },
      });
      expenseCount++;
      shareCount += allMembers.length;
    }
  }
  // Group-wallet expenses (paidById = null): consumed from the shared fund.
  const groupExpenses = [
    { name: 'Cáp treo Langbiang', amount: 750_000, category: ExpenseCategory.TICKET },
    { name: 'Ăn tối tập thể', amount: 1_500_000, category: ExpenseCategory.FOOD },
  ];
  let groupExpenseCount = 0;
  for (const tpl of groupExpenses) {
    const perShare = round2(tpl.amount / allMembers.length);
    const expenseDate = new Date(start);
    expenseDate.setHours(9 + expenseCount + groupExpenseCount, 0, 0, 0);
    await prisma.expense.create({
      data: {
        tripId: trip.id,
        paidById: null, // shared group wallet
        name: tpl.name,
        amount: tpl.amount,
        category: tpl.category,
        expenseDate,
        shares: {
          create: allMembers.map((u) => ({
            userId: u.id,
            shareAmount: perShare,
            isSettled: false,
          })),
        },
      },
    });
    groupExpenseCount++;
  }

  console.log(
    `Created ${expenseCount} person-paid + ${groupExpenseCount} group-paid expense(s), ${shareCount + groupExpenseCount * allMembers.length} share(s) (all unsettled).`,
  );

  // One clean, still-open payable: "Transfer to <name> — 700,000" with an
  // actionable button (not settled), like the other rows.
  const payee = fakeUsers.find((u) => u.displayName === 'Shin') ?? fakeUsers[0];
  if (payee) {
    // Clear any existing owner↔payee shares so the row is a single clean payable.
    await prisma.expenseShare.deleteMany({
      where: {
        OR: [
          {
            userId: owner.id,
            expense: { tripId: trip.id, paidById: payee.id },
          },
          {
            userId: payee.id,
            expense: { tripId: trip.id, paidById: owner.id },
          },
        ],
      },
    });
    const payDate = new Date(start);
    payDate.setHours(20, 0, 0, 0);
    await prisma.expense.create({
      data: {
        tripId: trip.id,
        paidById: payee.id, // they paid; I owe them
        name: 'Homestay lần 2',
        amount: 1_400_000,
        category: ExpenseCategory.STAY,
        expenseDate: payDate,
        shares: {
          create: [
            { userId: owner.id, shareAmount: 700_000, isSettled: false },
            { userId: payee.id, shareAmount: 700_000, isSettled: false },
          ],
        },
      },
    });
    console.log(
      `Open payable: "Transfer to ${payee.displayName}" 700,000 (actionable).`,
    );
  }

  console.log('\nDone. From the owner POV you should now see:');
  console.log(
    `  • Receivables: ${fakeUsers.length} people owe you (expenses you paid)`,
  );
  console.log(
    `  • Payables: you owe ${fakeUsers.length} people (expenses they paid)`,
  );
  console.log('End the trip in the app to open the Breakdown tab.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
