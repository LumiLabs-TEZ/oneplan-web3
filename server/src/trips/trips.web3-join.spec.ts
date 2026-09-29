import { ForbiddenException } from '@nestjs/common';
import { InviteStatus, TripStatus } from '@prisma/client';
import { TripsService } from './trips.service';

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */
function makeService(opts: { web3: boolean; member?: any }) {
  const trip = {
    id: 9,
    name: 'T',
    coverImageUrl: null,
    status: TripStatus.PLANNING,
    web3: opts.web3,
    createdById: 1,
    _count: { members: 2 },
  };
  const prisma = {
    trip: {
      findUnique: jest.fn().mockResolvedValue(trip),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    tripMember: {
      findUnique: jest.fn().mockResolvedValue(opts.member ?? null),
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({ user: {} }),
    },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
  } as any;
  const service = new TripsService(
    prisma,
    { log: jest.fn() } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { track: jest.fn() } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  jest.spyOn(service as any, 'findTripDetail').mockResolvedValue({ id: 9 });
  return { service, prisma };
}

describe('TripsService — web3 trips are closed to non-eligible IPs', () => {
  it('joinTrip: a non-eligible IP is 403 web3_unavailable and no membership is created', async () => {
    const { service, prisma } = makeService({ web3: true });
    const err = await service
      .joinTrip('code', 5, false)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({
      code: 'web3_unavailable',
    });
    expect(prisma.tripMember.upsert).not.toHaveBeenCalled();
  });

  it('joinTrip: a non-eligible IP may still join a web2 trip', async () => {
    const { service, prisma } = makeService({ web3: false });
    await service.joinTrip('code', 5, false).catch(() => undefined);
    expect(prisma.tripMember.upsert).toHaveBeenCalled();
  });

  it('joinTrip: an eligible IP can join a web3 trip', async () => {
    const { service, prisma } = makeService({ web3: true });
    await service.joinTrip('code', 5, true).catch(() => undefined);
    expect(prisma.tripMember.upsert).toHaveBeenCalled();
  });

  it('respondToInvite: accepting a web3 invite from a non-eligible IP is 403 and stays pending', async () => {
    const { service, prisma } = makeService({
      web3: true,
      member: { inviteStatus: InviteStatus.PENDING },
    });
    await expect(
      service.respondToInvite(
        9,
        5,
        { status: InviteStatus.ACCEPTED } as any,
        false,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.tripMember.update).not.toHaveBeenCalled();
  });

  it('respondToInvite: declining is always allowed', async () => {
    const { service, prisma } = makeService({
      web3: true,
      member: { inviteStatus: InviteStatus.PENDING },
    });
    await service.respondToInvite(
      9,
      5,
      { status: InviteStatus.DECLINED } as any,
      false,
    );
    expect(prisma.tripMember.update).toHaveBeenCalled();
  });

  it('getInvitePreview exposes web3 and the caller eligibility', async () => {
    const { service } = makeService({ web3: true });
    (service as any).storageService = { getSignedThumbUrl: jest.fn() };
    const preview = await service.getInvitePreview('code', 5, false);
    expect(preview).toMatchObject({ web3: true, web3Eligible: false });
  });
});
