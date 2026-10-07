import { Web3EligibilityService } from './web3-eligibility.service';

const VN_IP = '113.161.1.1';
const US_IP = '8.8.8.8';

function build(
  opts: {
    enabled?: boolean;
    configured?: boolean;
    override?: string;
    member?: object | null;
    allowlisted?: boolean;
  } = {},
) {
  const {
    enabled = true,
    configured = true,
    override,
    member = null,
    allowlisted = false,
  } = opts;
  const config = { get: jest.fn().mockReturnValue(override) };
  const solana = { isEnabled: enabled, isConfigured: configured };
  const prisma = {
    tripMember: { findFirst: jest.fn().mockResolvedValue(member) },
    web3Allowlist: {
      findUnique: jest
        .fn()
        .mockResolvedValue(allowlisted ? { userId: 7 } : null),
    },
  };
  return {
    prisma,
    svc: new Web3EligibilityService(
      config as never,
      solana as never,
      prisma as never,
    ),
  };
}

describe('Web3EligibilityService', () => {
  it('is eligible for a non-VN IP', async () => {
    await expect(build().svc.isEligible(US_IP)).resolves.toBe(true);
  });

  it('is not eligible for a VN IP', async () => {
    await expect(build().svc.isEligible(VN_IP)).resolves.toBe(false);
  });

  it('handles an IPv4-mapped IPv6 address behind the proxy', async () => {
    await expect(build().svc.isEligible(`::ffff:${VN_IP}`)).resolves.toBe(
      false,
    );
    await expect(build().svc.isEligible(`::ffff:${US_IP}`)).resolves.toBe(true);
  });

  it('fails closed on an unknown, missing or garbage IP', async () => {
    const { svc } = build();
    await expect(svc.isEligible(undefined)).resolves.toBe(false);
    await expect(svc.isEligible('not-an-ip')).resolves.toBe(false);
    await expect(svc.isEligible('0.0.0.0')).resolves.toBe(false);
  });

  it('is not eligible on a private IP by default', async () => {
    const { svc } = build();
    for (const ip of [
      '127.0.0.1',
      '::1',
      '10.0.0.5',
      '192.168.1.9',
      '172.20.0.3',
    ]) {
      await expect(svc.isEligible(ip)).resolves.toBe(false);
    }
  });

  it('honours WEB3_DEV_COUNTRY_OVERRIDE for private IPs only', async () => {
    await expect(
      build({ override: 'US' }).svc.isEligible('127.0.0.1'),
    ).resolves.toBe(true);
    await expect(
      build({ override: 'vn' }).svc.isEligible('127.0.0.1'),
    ).resolves.toBe(false);
    // A public VN IP is not rescued by the override.
    await expect(build({ override: 'US' }).svc.isEligible(VN_IP)).resolves.toBe(
      false,
    );
  });

  it('is not eligible when WEB3_ENABLED is off', async () => {
    await expect(build({ enabled: false }).svc.isEligible(US_IP)).resolves.toBe(
      false,
    );
  });

  it('is not eligible when the SOLANA keys are missing', async () => {
    await expect(
      build({ configured: false }).svc.isEligible(US_IP),
    ).resolves.toBe(false);
  });

  describe('admin allowlist', () => {
    it('makes an allowlisted user eligible from a VN IP', async () => {
      const { svc, prisma } = build({ allowlisted: true });
      await expect(svc.isEligible(VN_IP, 7)).resolves.toBe(true);
      expect(prisma.web3Allowlist.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 7 } }),
      );
    });

    it('also covers unknown IPs (fails closed otherwise)', async () => {
      await expect(
        build({ allowlisted: true }).svc.isEligible(undefined, 7),
      ).resolves.toBe(true);
      await expect(build().svc.isEligible(undefined, 7)).resolves.toBe(false);
    });

    it('keeps a non-listed user on a VN IP out', async () => {
      await expect(build().svc.isEligible(VN_IP, 7)).resolves.toBe(false);
    });

    it('needs a user id to check the allowlist', async () => {
      const { svc, prisma } = build({ allowlisted: true });
      await expect(svc.isEligible(VN_IP)).resolves.toBe(false);
      expect(prisma.web3Allowlist.findUnique).not.toHaveBeenCalled();
    });

    it('skips the lookup for an eligible IP', async () => {
      const { svc, prisma } = build();
      await expect(svc.isEligible(US_IP, 7)).resolves.toBe(true);
      expect(prisma.web3Allowlist.findUnique).not.toHaveBeenCalled();
    });

    it('never bypasses the kill switch or missing keys', async () => {
      for (const opts of [{ enabled: false }, { configured: false }]) {
        const { svc, prisma } = build({ ...opts, allowlisted: true });
        await expect(svc.isEligible(VN_IP, 7)).resolves.toBe(false);
        expect(prisma.web3Allowlist.findUnique).not.toHaveBeenCalled();
      }
    });
  });

  describe('hasWeb3Trip', () => {
    it('is true for an accepted member of a web3 trip', async () => {
      const { svc, prisma } = build({ member: { tripId: 1 } });
      await expect(svc.hasWeb3Trip(7)).resolves.toBe(true);
      expect(prisma.tripMember.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 7,
            trip: { web3: true },
          }) as object,
        }),
      );
    });

    it('is false with no web3 trip, and false (no query) when the server is dark', async () => {
      await expect(build().svc.hasWeb3Trip(7)).resolves.toBe(false);
      const dark = build({ enabled: false, member: { tripId: 1 } });
      await expect(dark.svc.hasWeb3Trip(7)).resolves.toBe(false);
      expect(dark.prisma.tripMember.findFirst).not.toHaveBeenCalled();
    });
  });
});
