import { Web3Controller } from './web3.controller';

describe('Web3Controller.getEligibility', () => {
  const build = (mwaFlag: unknown, eligible = true) => {
    const config = {
      get: jest.fn((key: string, fallback?: unknown) =>
        key === 'WEB3_MWA_ENABLED' && mwaFlag !== undefined
          ? mwaFlag
          : fallback,
      ),
    };
    const eligibility = {
      isEligible: jest.fn().mockResolvedValue(eligible),
      hasWeb3Trip: jest.fn().mockResolvedValue(false),
    };
    const faucet = { isEnabled: true };
    return new Web3Controller(
      eligibility as never,
      faucet as never,
      config as never,
    );
  };
  const req = { ip: '1.2.3.4' } as never;

  it('serves mwaEnabled true by default', async () => {
    await expect(
      build(undefined).getEligibility(7, req),
    ).resolves.toMatchObject({
      mwaEnabled: true,
    });
  });

  it.each([false, 'false'])(
    'serves mwaEnabled false when the flag is %p',
    async (flag) => {
      await expect(build(flag).getEligibility(7, req)).resolves.toMatchObject({
        mwaEnabled: false,
      });
    },
  );

  it('is a wallet choice, not gated on eligibility', async () => {
    await expect(build(true, false).getEligibility(7, req)).resolves.toEqual({
      eligible: false,
      hasWeb3Trip: false,
      faucetEnabled: false,
      mwaEnabled: true,
    });
  });
});
