/** @jest-environment node */
import { ApiMutationError, mutationErrorMessage } from './mutationError';

describe('ApiMutationError', () => {
  it('carries status, body and a classified message', () => {
    const err = new ApiMutationError(400, { message: 'Bad', memberNames: ['Ken', 'Mai'] });
    expect(err.status).toBe(400);
    expect(err.body).toEqual({ message: 'Bad', memberNames: ['Ken', 'Mai'] });
    expect(err.classified.kind).toBe('http');
    expect(err.classified.message).toBe('Bad');
    expect(err.message).toBe('Bad');
  });

  it('keeps structured fields reachable off body', () => {
    const err = new ApiMutationError(400, { memberNames: ['Ken', 'Mai'] });
    const body = err.body as { memberNames: string[] };
    expect(body.memberNames).toEqual(['Ken', 'Mai']);
  });
});

describe('mutationErrorMessage', () => {
  it('uses the classified message for ApiMutationError', () => {
    const err = new ApiMutationError(403, { message: 'Forbidden' });
    expect(mutationErrorMessage(err, 'fallback')).toBe('Forbidden');
  });

  it('classifies other errors and falls back on empty message', () => {
    expect(mutationErrorMessage(new Error(''), 'fallback')).toBe('fallback');
    expect(mutationErrorMessage('boom', 'fallback')).toBe('boom');
  });
});
