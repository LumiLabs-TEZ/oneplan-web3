import { NotFoundException } from '@nestjs/common';
import { Web3AllowlistService } from './web3-allowlist.service';

const CREATED = new Date('2026-09-30T08:15:29.123Z');
const row = (note: string | null = null) => ({
  userId: 7,
  note,
  addedByEmail: 'admin@oneplan.space',
  createdAt: CREATED,
  user: { email: 'demo@example.com', displayName: 'Demo' },
});

function build(user: { id: number } | null = { id: 7 }) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    web3Allowlist: {
      findMany: jest.fn().mockResolvedValue([row('Demo Day')]),
      upsert: jest
        .fn()
        .mockImplementation((args: { update: { note: string | null } }) =>
          Promise.resolve(row(args.update.note)),
        ),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return { prisma, svc: new Web3AllowlistService(prisma as never) };
}

describe('Web3AllowlistService', () => {
  it('lists entries newest first with ISO dates', async () => {
    const { svc, prisma } = build();
    await expect(svc.list()).resolves.toEqual([
      {
        userId: 7,
        email: 'demo@example.com',
        displayName: 'Demo',
        note: 'Demo Day',
        addedByEmail: 'admin@oneplan.space',
        createdAt: '2026-09-30T08:15:29.123Z',
      },
    ]);
    expect(prisma.web3Allowlist.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });

  it('adds by normalized email, idempotently (re-add updates the note)', async () => {
    const { svc, prisma } = build();
    const out = await svc.add(
      { email: '  Demo@Example.com ', note: ' phone A ' },
      'admin@oneplan.space',
    );
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'demo@example.com' } }),
    );
    expect(prisma.web3Allowlist.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 7 },
        create: {
          userId: 7,
          addedByEmail: 'admin@oneplan.space',
          note: 'phone A',
        },
        update: { note: 'phone A' },
      }),
    );
    expect(out).toMatchObject({ userId: 7, note: 'phone A' });
  });

  it('stores a blank note as null', async () => {
    const { svc, prisma } = build();
    await svc.add({ email: 'demo@example.com', note: '   ' }, 'a@b.c');
    expect(prisma.web3Allowlist.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { note: null } }),
    );
  });

  it('404s an unknown email and writes nothing', async () => {
    const { svc, prisma } = build(null);
    await expect(
      svc.add({ email: 'nobody@example.com' }, 'a@b.c'),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.web3Allowlist.upsert).not.toHaveBeenCalled();
  });

  it('removes a listed user, 404s one that is not listed', async () => {
    const { svc, prisma } = build();
    await expect(svc.remove(7, 'a@b.c')).resolves.toBeUndefined();
    expect(prisma.web3Allowlist.deleteMany).toHaveBeenCalledWith({
      where: { userId: 7 },
    });
    prisma.web3Allowlist.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(svc.remove(8, 'a@b.c')).rejects.toThrow(NotFoundException);
  });
});
