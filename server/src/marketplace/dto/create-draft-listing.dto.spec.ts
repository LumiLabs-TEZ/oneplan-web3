import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDraftListingDto } from './create-draft-listing.dto';
const base = { name: 'Trip', countryId: 1 };
describe('draft listing destination contract', () => {
  it.each([
    {},
    { cityId: 1, stateId: 2 },
    { cityId: null, stateId: 2 },
    { cityId: null, stateId: null },
  ])('accepts omitted, numeric and nullable locations: %j', async (body) => {
    const dto = plainToInstance(CreateDraftListingDto, { ...base, ...body });
    expect(await validate(dto)).toHaveLength(0);
    for (const key of ['cityId', 'stateId'] as const)
      expect(dto[key]).toBe((body as Partial<typeof dto>)[key]);
  });
  it.each([{ cityId: '1' }, { stateId: 1.5 }])(
    'rejects invalid values: %j',
    async (body) => {
      expect(
        (
          await validate(
            plainToInstance(CreateDraftListingDto, { ...base, ...body }),
          )
        ).length,
      ).toBeGreaterThan(0);
    },
  );
});
