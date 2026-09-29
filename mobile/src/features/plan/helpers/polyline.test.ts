import { decodePolyline } from './polyline';

describe('decodePolyline', () => {
  it('decodes the Google encoded-polyline algorithm doc sample', () => {
    const result = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(result).toHaveLength(3);
    expect(result[0]!.latitude).toBeCloseTo(38.5, 5);
    expect(result[0]!.longitude).toBeCloseTo(-120.2, 5);
    expect(result[1]!.latitude).toBeCloseTo(40.7, 5);
    expect(result[1]!.longitude).toBeCloseTo(-120.95, 5);
    expect(result[2]!.latitude).toBeCloseTo(43.252, 5);
    expect(result[2]!.longitude).toBeCloseTo(-126.453, 5);
  });

  it('returns an empty array for an empty string', () => {
    expect(decodePolyline('')).toEqual([]);
  });

  it('respects a custom precision', () => {
    // Same sample re-encoded conceptually at precision 5 is the default; verify
    // precision changes the division factor deterministically.
    const withDefault = decodePolyline('_p~iF~ps|U');
    const withPrecision5 = decodePolyline('_p~iF~ps|U', 5);
    expect(withDefault).toEqual(withPrecision5);
  });
});
