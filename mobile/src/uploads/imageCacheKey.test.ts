import { imageCacheKey } from './imageCacheKey';

describe('imageCacheKey (TripImageCache.swift parity)', () => {
  it('returns the uri unchanged when it has no query or fragment', () => {
    expect(imageCacheKey('https://cdn.example.com/trips/1/cover.jpg')).toBe(
      'https://cdn.example.com/trips/1/cover.jpg',
    );
  });

  it('strips the presigned query string', () => {
    expect(
      imageCacheKey(
        'https://s3.example.com/bucket/cover.jpg?X-Amz-Signature=abc&X-Amz-Expires=900',
      ),
    ).toBe('https://s3.example.com/bucket/cover.jpg');
  });

  it('strips the fragment', () => {
    expect(imageCacheKey('https://cdn.example.com/a.png#section')).toBe(
      'https://cdn.example.com/a.png',
    );
  });

  it('strips both when the fragment follows the query', () => {
    expect(imageCacheKey('https://cdn.example.com/a.png?token=1#frag')).toBe(
      'https://cdn.example.com/a.png',
    );
  });

  it('strips both when the fragment comes first', () => {
    expect(imageCacheKey('https://cdn.example.com/a.png#frag?token=1')).toBe(
      'https://cdn.example.com/a.png',
    );
  });

  it('gives the same key for two signatures of the same object', () => {
    const a = imageCacheKey('https://s3.example.com/o.jpg?X-Amz-Signature=1');
    const b = imageCacheKey('https://s3.example.com/o.jpg?X-Amz-Signature=2');
    expect(a).toBe(b);
  });
});

it('keeps distinct Metro asset identities stored in the query', () => {
  const first = 'http://localhost:8081/assets/?unstable_path=assets%2Ffirst.png&platform=ios';
  const second = 'http://localhost:8081/assets/?unstable_path=assets%2Fsecond.png&platform=ios';
  expect(imageCacheKey(first)).toBe(first);
  expect(imageCacheKey(first)).not.toBe(imageCacheKey(second));
});
