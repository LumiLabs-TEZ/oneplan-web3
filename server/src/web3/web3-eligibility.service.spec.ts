import { Web3EligibilityService } from './web3-eligibility.service';

const VN_IP = '113.161.1.1';
const US_IP = '8.8.8.8';

function build(
  opts: {
    enabled?: boolean;
    configured?: boolean;
    override?: string;
    member?: object | null;
  } = {},
) {
  const { enabled = true, configured = true, override, member = null } = opts;
  const config = { get: jest.fn().mockReturnValue(override) };
  const solana = { isEnabled: enabled, isConfigured: configured };
  const prisma = {
    tripMember: { findFirst: jest.fn().mockResolvedValue(member) },
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
  it('is eligible for a non-VN IP', () => {
    expect(build().svc.isEligible(US_IP)).toBe(true);
  });

  it('is not eligible for a VN IP', () => {
    expect(build().svc.isEligible(VN_IP)).toBe(false);
  });

  it('handles an IPv4-mapped IPv6 address behind the proxy', () => {
    expect(build().svc.isEligible(`::ffff:${VN_IP}`)).toBe(false);
    expect(build().svc.isEligible(`::ffff:${US_IP}`)).toBe(true);
  });

  it('fails closed on an unknown, missing or garbage IP', () => {
    const { svc } = build();
    expect(svc.isEligible(undefined)).toBe(false);
    expect(svc.isEligible('not-an-ip')).toBe(false);
    expect(svc.isEligible('0.0.0.0')).toBe(false);
  });

  it('is not eligible on a private IP by default', () => {
    const { svc } = build();
    for (const ip of [
      '127.0.0.1',
      '::1',
      '10.0.0.5',
      '192.168.1.9',
      '172.20.0.3',
    ]) {
      expect(svc.isEligible(ip)).toBe(false);
    }
  });

  it('honours WEB3_DEV_COUNTRY_OVERRIDE for private IPs only', () => {
    expect(build({ override: 'US' }).svc.isEligible('127.0.0.1')).toBe(true);
    expect(build({ override: 'vn' }).svc.isEligible('127.0.0.1')).toBe(false);
    // A public VN IP is not rescued by the override.
    expect(build({ override: 'US' }).svc.isEligible(VN_IP)).toBe(false);
  });

  it('is not eligible when WEB3_ENABLED is off', () => {
    expect(build({ enabled: false }).svc.isEligible(US_IP)).toBe(false);
  });

  it('is not eligible when the SOLANA keys are missing', () => {
    expect(build({ configured: false }).svc.isEligible(US_IP)).toBe(false);
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
