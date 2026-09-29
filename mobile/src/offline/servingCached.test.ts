import { isServingCached } from './servingCached';

describe('isServingCached', () => {
  const data = { id: 1 };

  it('is true when data is present and the last fetch failed with an offline error', () => {
    expect(isServingCached({ data, error: new TypeError('Network request failed') }, true)).toBe(
      true,
    );
    expect(isServingCached({ data, error: new TypeError('Failed to fetch') }, true)).toBe(true);
  });

  it('is false for timeouts — a slow backend is not "offline"', () => {
    const timeout = new Error('The request timed out');
    timeout.name = 'TimeoutError';
    expect(isServingCached({ data, error: timeout }, true)).toBe(false);
  });

  it('is false for HTTP / unknown errors while online', () => {
    expect(isServingCached({ data, error: new Error('HTTP 500') }, true)).toBe(false);
  });

  it('is false without data, whatever the connectivity', () => {
    expect(isServingCached({ data: undefined, error: null }, false)).toBe(false);
    expect(
      isServingCached({ data: undefined, error: new TypeError('Network request failed') }, true),
    ).toBe(false);
  });

  it('is true when offline with data even without an error', () => {
    expect(isServingCached({ data, error: null }, false)).toBe(true);
  });

  it('is false when online with data and no error', () => {
    expect(isServingCached({ data, error: null }, true)).toBe(false);
  });
});
