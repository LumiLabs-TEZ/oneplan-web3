import {
  handleUnhandledRejection,
  isWeb3Rejection,
  scopeUnhandledRejections,
} from './unhandled-rejection';

function errorWithStack(stack: string): Error {
  const error = new Error('boom');
  error.stack = stack;
  return error;
}

describe('M1: scoped unhandledRejection handler', () => {
  it('recognises rejections that run through the Solana libraries or vault modules', () => {
    expect(
      isWeb3Rejection(
        errorWithStack(
          'Error: 429\n at x (/app/node_modules/@solana/web3.js/lib/index.cjs.js:1:1)',
        ),
      ),
    ).toBe(true);
    expect(
      isWeb3Rejection(
        errorWithStack(
          'Error\n at y (/app/dist/src/trip-vault/trip-vault.service.js:1:1)',
        ),
      ),
    ).toBe(true);
  });

  it('does not claim unrelated rejections or non-errors', () => {
    expect(
      isWeb3Rejection(
        errorWithStack(
          'Error\n at z (/app/dist/src/trips/trips.service.js:1:1)',
        ),
      ),
    ).toBe(false);
    expect(isWeb3Rejection('string reason')).toBe(false);
  });

  it('swallows a web3 rejection (no exit)', () => {
    const exit = jest.fn();
    handleUnhandledRejection(
      errorWithStack('Error\n at (/app/node_modules/@solana/web3.js/x.js:1:1)'),
      exit,
    );
    expect(exit).not.toHaveBeenCalled();
  });

  it('exits non-zero on any other rejection, like stock Node', () => {
    const exit = jest.fn();
    handleUnhandledRejection(
      errorWithStack('Error\n at (/app/dist/src/trips/trips.service.js:1:1)'),
      exit,
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('installs nothing while WEB3_ENABLED is not "true"', () => {
    const before = process.listenerCount('unhandledRejection');
    const previous = process.env.WEB3_ENABLED;
    delete process.env.WEB3_ENABLED;
    scopeUnhandledRejections();
    process.env.WEB3_ENABLED = 'false';
    scopeUnhandledRejections();
    if (previous === undefined) delete process.env.WEB3_ENABLED;
    else process.env.WEB3_ENABLED = previous;
    expect(process.listenerCount('unhandledRejection')).toBe(before);
  });
});
