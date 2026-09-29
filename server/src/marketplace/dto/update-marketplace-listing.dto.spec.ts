import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateMarketplaceListingDto } from './update-marketplace-listing.dto';
describe('listing destination patch contract', () => {
  it.each([
    {},
    { cityId: 1, stateId: 2 },
    { cityId: null, stateId: 2 },
    { cityId: null, stateId: null },
  ])('accepts omitted, numeric and nullable locations: %j', async (body) => {
    const dto = plainToInstance(UpdateMarketplaceListingDto, body);
    expect(await validate(dto)).toHaveLength(0);
    for (const key of ['cityId', 'stateId'] as const)
      expect(dto[key]).toBe(body[key]);
  });
  it.each([{ cityId: '1' }, { stateId: 1.5 }])(
    'rejects invalid values: %j',
    async (body) => {
      expect(
        (await validate(plainToInstance(UpdateMarketplaceListingDto, body)))
          .length,
      ).toBeGreaterThan(0);
    },
  );
});
