import { InviteStatus, Prisma, PrismaClient, TripStatus } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Display names of accepted members of `tripId` who are already on ANOTHER
 * ongoing trip. Non-empty means the trip can't start (one ongoing trip per
 * user — the invariant the iOS Home "ongoing" card relies on).
 */
export async function findOngoingConflictNames(
  prisma: Db,
  tripId: number,
): Promise<string[]> {
  const members = await prisma.tripMember.findMany({
    where: { tripId, inviteStatus: InviteStatus.ACCEPTED },
    select: { userId: true, user: { select: { displayName: true } } },
  });
  const memberUserIds = members.map((m) => m.userId);

  const conflictingTrips = await prisma.trip.findMany({
    where: {
      id: { not: tripId },
      status: TripStatus.ONGOING,
      members: {
        some: {
          userId: { in: memberUserIds },
          inviteStatus: InviteStatus.ACCEPTED,
        },
      },
    },
    select: {
      members: {
        where: {
          userId: { in: memberUserIds },
          inviteStatus: InviteStatus.ACCEPTED,
        },
        select: { user: { select: { displayName: true } } },
      },
    },
  });

  return [
    ...new Set(
      conflictingTrips.flatMap((t) => t.members.map((m) => m.user.displayName)),
    ),
  ];
}

/**
 * When a trip starts, items planned by relative day number get a concrete
 * `planDate` = startDate + (dayNumber − 1). Items that already have one are
 * left alone.
 */
export async function convertDayNumbersToPlanDates(
  prisma: Db,
  tripId: number,
  startDate: Date,
): Promise<void> {
  const items = await prisma.tripPlanItem.findMany({
    where: { tripId, dayNumber: { not: null } },
  });
  for (const item of items) {
    if (item.planDate) continue;
    const planDate = new Date(startDate);
    planDate.setDate(planDate.getDate() + (item.dayNumber! - 1));
    await prisma.tripPlanItem.update({
      where: { id: item.id },
      data: { planDate },
    });
  }
}
