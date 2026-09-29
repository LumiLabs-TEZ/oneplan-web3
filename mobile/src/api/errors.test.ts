import { classifyError, conflictSessionId, isInsufficientCredits } from './errors';

describe('classifyError', () => {
  it.each([
    [new TypeError('Network request failed'), 'offline'],
    [Object.assign(new Error('Aborted'), { name: 'AbortError' }), 'timeout'],
    [new Error('boom'), 'unknown'],
  ])('%p → %s', (err, kind) => {
    expect(classifyError(err).kind).toBe(kind);
  });

  it('http responses', () => {
    expect(classifyError({ message: 'Nope' }, { status: 403 })).toEqual({
      kind: 'http',
      status: 403,
      message: 'Nope',
      body: { message: 'Nope' },
    });
    expect(classifyError(null, { status: 500 }).message).toBe('HTTP 500');
    expect(classifyError(null, { status: 401 }).kind).toBe('auth_expired');
  });
});

describe('board error bodies', () => {
  const credits = {
    code: 'insufficient_scan_credits',
    message: 'x',
    available: 0,
    nextProGrantAt: null,
    canPurchase: true,
  };
  it('402 insufficient credits', () => {
    expect(isInsufficientCredits(402, credits)).toBe(true);
    expect(isInsufficientCredits(400, credits)).toBe(false);
    expect(isInsufficientCredits(402, { code: 'other' })).toBe(false);
  });
  it('409 extraction in progress', () => {
    expect(conflictSessionId(409, { code: 'extraction_in_progress', sessionId: 'abc' })).toBe(
      'abc',
    );
    expect(conflictSessionId(409, { code: 'extraction_in_progress' })).toBeNull();
    expect(conflictSessionId(200, { code: 'extraction_in_progress', sessionId: 'abc' })).toBeNull();
  });
});
