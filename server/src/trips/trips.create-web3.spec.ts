import { ForbiddenException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { Web3EligibilityService } from '../web3/web3-eligibility.service';
import type { TripEndConsensusService } from './trip-end-consensus.service';
import { TripsController } from './trips.controller';
import type { TripsService } from './trips.service';
import type { CreateTripDto } from './dto/create-trip.dto';

function makeController(eligible: boolean) {
  const tripsService = {
    createTrip: jest.fn().mockResolvedValue({ id: 1 }),
  };
  const web3Eligibility = {
    isEligible: jest.fn().mockResolvedValue(eligible),
  };
  const controller = new TripsController(
    tripsService as unknown as TripsService,
    {} as TripEndConsensusService,
    web3Eligibility as unknown as Web3EligibilityService,
  );
  return { controller, tripsService, web3Eligibility };
}

const req = { ip: '1.2.3.4' } as FastifyRequest;
const base: CreateTripDto = { name: 'T', countryId: 1 };

describe('TripsController.createTrip — group wallet is opt-in', () => {
  it('omitted web3: ordinary trip, no eligibility lookup', async () => {
    const { controller, tripsService, web3Eligibility } = makeController(true);
    await controller.createTrip(7, base, req);
    expect(tripsService.createTrip).toHaveBeenCalledWith(7, base, false);
    expect(web3Eligibility.isEligible).not.toHaveBeenCalled();
  });

  it('web3: false: ordinary trip even for an eligible caller', async () => {
    const { controller, tripsService, web3Eligibility } = makeController(true);
    const dto = { ...base, web3: false };
    await controller.createTrip(7, dto, req);
    expect(tripsService.createTrip).toHaveBeenCalledWith(7, dto, false);
    expect(web3Eligibility.isEligible).not.toHaveBeenCalled();
  });

  it('web3: true + eligible: web3 trip', async () => {
    const { controller, tripsService, web3Eligibility } = makeController(true);
    const dto = { ...base, web3: true };
    await controller.createTrip(7, dto, req);
    expect(web3Eligibility.isEligible).toHaveBeenCalledWith('1.2.3.4', 7);
    expect(tripsService.createTrip).toHaveBeenCalledWith(7, dto, true);
  });

  it('web3: true + not eligible: 403 web3_unavailable, nothing created', async () => {
    const { controller, tripsService } = makeController(false);
    const err = await controller
      .createTrip(7, { ...base, web3: true }, req)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({
      code: 'web3_unavailable',
    });
    expect(tripsService.createTrip).not.toHaveBeenCalled();
  });
});
