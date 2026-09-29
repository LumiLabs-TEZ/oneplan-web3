/** @jest-environment node */
import { consumeSelfLeave, markSelfLeave, unmarkSelfLeave, useRealtimeStore } from './realtimeStore';

afterEach(() => {
  useRealtimeStore.getState().reset();
});

describe('realtimeStore pushEffect/consumeEffect', () => {
  it.each(['tripEnded', 'tripDeleted', 'tripMemberRemoved'] as const)(
    '%s: pushEffect sets a pending effect, consumeEffect clears it and reports true once',
    (kind) => {
      const { pushEffect, consumeEffect } = useRealtimeStore.getState();
      pushEffect({ type: kind, tripId: 12 });

      expect(consumeEffect(kind, 12)).toBe(true);
      expect(consumeEffect(kind, 12)).toBe(false);
    },
  );

  it('consumeEffect returns false for a different tripId than the pending one', () => {
    const { pushEffect, consumeEffect } = useRealtimeStore.getState();
    pushEffect({ type: 'tripMemberRemoved', tripId: 12 });
    expect(consumeEffect('tripMemberRemoved', 99)).toBe(false);
    // The pending effect for 12 is still there — a miss doesn't clear it.
    expect(consumeEffect('tripMemberRemoved', 12)).toBe(true);
  });

  it('effect kinds are independent — pushing one does not clear another', () => {
    const { pushEffect, consumeEffect } = useRealtimeStore.getState();
    pushEffect({ type: 'tripEnded', tripId: 12 });
    pushEffect({ type: 'tripMemberRemoved', tripId: 12 });

    expect(consumeEffect('tripEnded', 12)).toBe(true);
    expect(consumeEffect('tripMemberRemoved', 12)).toBe(true);
  });

  it('reset clears every pending effect', () => {
    const { pushEffect, consumeEffect, reset } = useRealtimeStore.getState();
    pushEffect({ type: 'tripMemberRemoved', tripId: 12 });
    reset();
    expect(consumeEffect('tripMemberRemoved', 12)).toBe(false);
  });
});

describe('self-leave marks', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('is one-shot: consumeSelfLeave reports true once for a marked trip', () => {
    markSelfLeave(7);
    expect(consumeSelfLeave(7)).toBe(true);
    expect(consumeSelfLeave(7)).toBe(false);
  });

  it('never matches an unmarked or different trip', () => {
    markSelfLeave(7);
    expect(consumeSelfLeave(8)).toBe(false);
    unmarkSelfLeave(7);
    expect(consumeSelfLeave(7)).toBe(false);
  });

  it('expires, so a leave whose event never arrived cannot swallow a later real removal', () => {
    jest.useFakeTimers();
    markSelfLeave(7);
    jest.advanceTimersByTime(31_000);
    expect(consumeSelfLeave(7)).toBe(false);
  });
});
