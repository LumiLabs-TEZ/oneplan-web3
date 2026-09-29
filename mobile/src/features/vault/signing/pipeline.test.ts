import { WalletError } from '../wallet/walletError';
import { signAndSubmit } from './pipeline';

describe('signAndSubmit', () => {
  it('verifies, signs, and submits in order, returning the submit result', async () => {
    const calls: string[] = [];
    const result = await signAndSubmit({
      unsignedTx: 'UNSIGNED',
      verify: () => {
        calls.push('verify');
      },
      sign: async (base64Tx) => {
        calls.push(`sign:${base64Tx}`);
        return 'SIGNED';
      },
      submit: async (signedTx) => {
        calls.push(`submit:${signedTx}`);
        return { signature: 'SIG' };
      },
    });

    expect(calls).toEqual(['verify', 'sign:UNSIGNED', 'submit:SIGNED']);
    expect(result).toEqual({ signature: 'SIG' });
  });

  it('verifier-reject path: a verify() throw stops the pipeline before signing or submitting', async () => {
    const sign = jest.fn();
    const submit = jest.fn();
    const rejection = new Error('amount mismatch');

    await expect(
      signAndSubmit({
        unsignedTx: 'UNSIGNED',
        verify: () => {
          throw rejection;
        },
        sign,
        submit,
      }),
    ).rejects.toBe(rejection);

    expect(sign).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('user-rejects: a sign() throw is wrapped in WalletError.signingFailed and never reaches submit', async () => {
    const submit = jest.fn();

    const promise = signAndSubmit({
      unsignedTx: 'UNSIGNED',
      verify: () => undefined,
      sign: async () => {
        throw new Error('User declined the request');
      },
      submit,
    });

    await expect(promise).rejects.toBeInstanceOf(WalletError);
    await expect(promise).rejects.toMatchObject({ kind: 'signingFailed' });
    expect(submit).not.toHaveBeenCalled();
  });

  it('submit fail: a submit() throw propagates unwrapped (e.g. ApiMutationError)', async () => {
    class FakeApiMutationError extends Error {}
    const submitError = new FakeApiMutationError('insufficient funds');

    await expect(
      signAndSubmit({
        unsignedTx: 'UNSIGNED',
        verify: () => undefined,
        sign: async () => 'SIGNED',
        submit: async () => {
          throw submitError;
        },
      }),
    ).rejects.toBe(submitError);
  });

  it('sign timeout: a sign() that never resolves rejects with WalletError after signTimeoutMs', async () => {
    const promise = signAndSubmit({
      unsignedTx: 'UNSIGNED',
      verify: () => undefined,
      sign: () => new Promise(() => undefined),
      submit: jest.fn(),
      signTimeoutMs: 10,
    });

    await expect(promise).rejects.toBeInstanceOf(WalletError);
    await expect(promise).rejects.toMatchObject({ kind: 'signingFailed', reason: expect.stringContaining('sign') });
  });

  it('confirm timeout: a confirm() that never resolves rejects with WalletError after confirmTimeoutMs, post-submit', async () => {
    const submit = jest.fn(async () => ({ signature: 'SIG' }));

    const promise = signAndSubmit({
      unsignedTx: 'UNSIGNED',
      verify: () => undefined,
      sign: async () => 'SIGNED',
      submit,
      confirm: () => new Promise(() => undefined),
      confirmTimeoutMs: 10,
    });

    await expect(promise).rejects.toBeInstanceOf(WalletError);
    await expect(promise).rejects.toMatchObject({
      kind: 'signingFailed',
      reason: expect.stringContaining('confirm'),
    });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('confirm resolves: the pipeline returns confirm()s result, not the raw submit result', async () => {
    const result = await signAndSubmit<{ status: string }>({
      unsignedTx: 'UNSIGNED',
      verify: () => undefined,
      sign: async () => 'SIGNED',
      submit: async () => ({ status: 'PENDING' }),
      confirm: async () => ({ status: 'CONFIRMED' }),
    });

    expect(result).toEqual({ status: 'CONFIRMED' });
  });

  it('calls onSigned after sign and before submit, and not at all when sign fails', async () => {
    const calls: string[] = [];
    await signAndSubmit({
      unsignedTx: 'UNSIGNED',
      verify: () => undefined,
      sign: async () => {
        calls.push('sign');
        return 'SIGNED';
      },
      onSigned: () => calls.push('onSigned'),
      submit: async () => {
        calls.push('submit');
        return {};
      },
    });
    expect(calls).toEqual(['sign', 'onSigned', 'submit']);

    const onSigned = jest.fn();
    await expect(
      signAndSubmit({
        unsignedTx: 'UNSIGNED',
        verify: () => undefined,
        sign: async () => {
          throw new Error('declined');
        },
        onSigned,
        submit: jest.fn(),
      }),
    ).rejects.toBeInstanceOf(WalletError);
    expect(onSigned).not.toHaveBeenCalled();
  });
});
