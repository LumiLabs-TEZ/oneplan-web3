import { encodePolyline } from './polyline';

describe('encodePolyline', () => {
  it('matches the reference example from the Google algorithm docs', () => {
    expect(
      encodePolyline([
        { latitude: 38.5, longitude: -120.2 },
        { latitude: 40.7, longitude: -120.95 },
        { latitude: 43.252, longitude: -126.453 },
      ]),
    ).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  });

  it('returns an empty string for no points', () => {
    expect(encodePolyline([])).toBe('');
  });
});
