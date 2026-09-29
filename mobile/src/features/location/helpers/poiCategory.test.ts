import { expenseCategoryForPoi } from './poiCategory';

describe('expenseCategoryForPoi', () => {
  it('returns null (never "OTHER") for null/empty/unrecognized input', () => {
    expect(expenseCategoryForPoi(null)).toBeNull();
    expect(expenseCategoryForPoi('')).toBeNull();
    expect(expenseCategoryForPoi('   ')).toBeNull();
    expect(expenseCategoryForPoi('Laundromat')).toBeNull();
  });

  it('maps food/coffee categories', () => {
    expect(expenseCategoryForPoi('Italian Restaurant')).toBe('FOOD');
    expect(expenseCategoryForPoi('Coffee Shop')).toBe('COFFEE');
    expect(expenseCategoryForPoi('Café')).toBe('COFFEE');
  });

  it('maps lodging to STAY', () => {
    expect(expenseCategoryForPoi('Hotel')).toBe('STAY');
    expect(expenseCategoryForPoi('Beach Resort')).toBe('STAY');
  });

  it('maps attractions to TICKET, and disambiguates from CINEMA/PARK', () => {
    expect(expenseCategoryForPoi('History Museum')).toBe('TICKET');
    expect(expenseCategoryForPoi('Amusement Park')).toBe('TICKET');
    expect(expenseCategoryForPoi('Movie Theater')).toBe('CINEMA');
    expect(expenseCategoryForPoi('National Park')).toBe('PARK');
  });

  it('maps the remaining buckets', () => {
    expect(expenseCategoryForPoi('Night Club')).toBe('NIGHT_CLUB');
    expect(expenseCategoryForPoi('Fitness Center')).toBe('GYM');
    expect(expenseCategoryForPoi('Pharmacy')).toBe('PHARMACY');
    expect(expenseCategoryForPoi('Airport')).toBe('TRANSPORT');
    expect(expenseCategoryForPoi('Shopping Mall')).toBe('SHOPPING');
  });

  it('maps hospitals/clinics to PHARMACY and beauty/massage to SPA (RN-only buckets)', () => {
    expect(expenseCategoryForPoi('Hospital')).toBe('PHARMACY');
    expect(expenseCategoryForPoi('Urgent Care Center')).toBe('PHARMACY');
    expect(expenseCategoryForPoi('Dentist')).toBe('PHARMACY');
    expect(expenseCategoryForPoi('Beauty Salon')).toBe('SPA');
    expect(expenseCategoryForPoi('Massage Studio')).toBe('SPA');
    expect(expenseCategoryForPoi('Day Spa')).toBe('SPA');
    expect(expenseCategoryForPoi('Spa')).toBe('SPA');
  });

  it('matches "spa" only as a whole word', () => {
    expect(expenseCategoryForPoi('Spanish Restaurant')).toBe('FOOD');
    expect(expenseCategoryForPoi('Coworking Space')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(expenseCategoryForPoi('COFFEE SHOP')).toBe('COFFEE');
  });
});
