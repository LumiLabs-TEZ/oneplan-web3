import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MissionsController } from './missions.controller';
import { MissionsService } from './missions.service';
import { RedeemRewardDto, ReportMissionEventDto } from './dto/missions.dto';

const USER_ID = 42;

const failedProps = async (dto: object): Promise<string[]> =>
  (await validate(dto)).map((e) => e.property);

describe('MissionsController', () => {
  // ── DTO validation (the ValidationPipe contract) ─────────────────────────

  describe('RedeemRewardDto', () => {
    it.each(['scan_credit_1', 'market_unlock', 'pro_7d', 'pro_30d'])(
      'accepts the catalog item %s',
      async (itemId) => {
        const dto = plainToInstance(RedeemRewardDto, { itemId });
        expect(await validate(dto)).toHaveLength(0);
      },
    );

    it('rejects an item id outside the catalog', async () => {
      const dto = plainToInstance(RedeemRewardDto, { itemId: 'free_pro' });
      expect(await failedProps(dto)).toEqual(['itemId']);
    });

    it('rejects a missing item id', async () => {
      const dto = plainToInstance(RedeemRewardDto, {});
      expect(await failedProps(dto)).toEqual(['itemId']);
    });

    it('accepts a positive integer listingId', async () => {
      const dto = plainToInstance(RedeemRewardDto, {
        itemId: 'market_unlock',
        listingId: 5,
      });
      expect(await validate(dto)).toHaveLength(0);
    });

    it.each([0, -1, 1.5])('rejects listingId %p', async (listingId) => {
      const dto = plainToInstance(RedeemRewardDto, {
        itemId: 'market_unlock',
        listingId,
      });
      expect(await failedProps(dto)).toEqual(['listingId']);
    });

    it('allows listingId to be absent (non-unlock items)', async () => {
      const dto = plainToInstance(RedeemRewardDto, {
        itemId: 'scan_credit_1',
      });
      expect(await validate(dto)).toHaveLength(0);
    });
  });

  describe('ReportMissionEventDto', () => {
    it.each([
      'market_shared',
      'appstore_review_opened',
      'missions_sheet_viewed',
    ])('accepts the allowlisted event %s', async (event) => {
      const dto = plainToInstance(ReportMissionEventDto, { event });
      expect(await validate(dto)).toHaveLength(0);
    });

    it('rejects an event outside the allowlist', async () => {
      const dto = plainToInstance(ReportMissionEventDto, {
        event: 'first_trip',
      });
      expect(await failedProps(dto)).toEqual(['event']);
    });

    it('rejects a missing event', async () => {
      const dto = plainToInstance(ReportMissionEventDto, {});
      expect(await failedProps(dto)).toEqual(['event']);
    });

    it.each([0, -1, 2.5])('rejects listingId %p', async (listingId) => {
      const dto = plainToInstance(ReportMissionEventDto, {
        event: 'market_shared',
        listingId,
      });
      expect(await failedProps(dto)).toEqual(['listingId']);
    });

    it('accepts a positive integer listingId', async () => {
      const dto = plainToInstance(ReportMissionEventDto, {
        event: 'market_shared',
        listingId: 12,
      });
      expect(await validate(dto)).toHaveLength(0);
    });

    it('rejects a source longer than 32 characters', async () => {
      const dto = plainToInstance(ReportMissionEventDto, {
        event: 'missions_sheet_viewed',
        source: 'x'.repeat(33),
      });
      expect(await failedProps(dto)).toEqual(['source']);
    });

    it('accepts a source at the 32-character limit', async () => {
      const dto = plainToInstance(ReportMissionEventDto, {
        event: 'missions_sheet_viewed',
        source: 'x'.repeat(32),
      });
      expect(await validate(dto)).toHaveLength(0);
    });
  });

  // ── Delegation ───────────────────────────────────────────────────────────

  describe('delegation', () => {
    let missions: {
      getOverview: jest.Mock;
      handleClientEvent: jest.Mock;
      redeem: jest.Mock;
    };
    let controller: MissionsController;

    beforeEach(() => {
      missions = {
        getOverview: jest.fn().mockResolvedValue({ balance: 7 }),
        handleClientEvent: jest.fn().mockResolvedValue({
          awarded: true,
          balance: 17,
        }),
        redeem: jest.fn().mockResolvedValue({ itemId: 'scan_credit_1' }),
      };
      controller = new MissionsController(
        missions as unknown as MissionsService,
      );
    });

    it('getMissions passes the caller id through and returns the overview', async () => {
      await expect(controller.getMissions(USER_ID)).resolves.toEqual({
        balance: 7,
      });
      expect(missions.getOverview).toHaveBeenCalledWith(USER_ID);
    });

    it('reportMissionEvent passes the caller id and dto through', async () => {
      const dto: ReportMissionEventDto = {
        event: 'market_shared',
        listingId: 5,
      };
      await expect(
        controller.reportMissionEvent(USER_ID, dto),
      ).resolves.toEqual({ awarded: true, balance: 17 });
      expect(missions.handleClientEvent).toHaveBeenCalledWith(USER_ID, dto);
    });

    it('redeemReward passes the caller id and dto through', async () => {
      const dto: RedeemRewardDto = { itemId: 'scan_credit_1' };
      await expect(controller.redeemReward(USER_ID, dto)).resolves.toEqual({
        itemId: 'scan_credit_1',
      });
      expect(missions.redeem).toHaveBeenCalledWith(USER_ID, dto);
    });
  });
});
