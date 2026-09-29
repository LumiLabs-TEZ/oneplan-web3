import { canPanBegin, nextRevealState, resolveGestureEnd, revealLabelKey } from './pullToReveal';

describe('nextRevealState', () => {
  it('opens when dragged down past the threshold', () => {
    expect(nextRevealState(false, 120, 0)).toBe(true);
  });

  it('stays closed when the drag does not clear the threshold', () => {
    expect(nextRevealState(false, 50, 0)).toBe(false);
  });

  it('opens on a fast downward flick even under the distance threshold', () => {
    expect(nextRevealState(false, 20, 1000)).toBe(true);
  });

  it('closes when dragged up past the threshold', () => {
    expect(nextRevealState(true, -120, 0)).toBe(false);
  });

  it('stays open when the upward drag does not clear the threshold', () => {
    expect(nextRevealState(true, -50, 0)).toBe(true);
  });

  it('closes on a fast upward flick even under the distance threshold', () => {
    expect(nextRevealState(true, -20, -1000)).toBe(false);
  });

  it('a downward drag while already open has no effect (stays open)', () => {
    expect(nextRevealState(true, 120, 0)).toBe(true);
  });

  it('an upward drag while already closed has no effect (stays closed)', () => {
    expect(nextRevealState(false, -120, 0)).toBe(false);
  });
});

describe('revealLabelKey', () => {
  it('returns the close label when revealed', () => {
    expect(revealLabelKey(true)).toBe('Swipe up to close');
  });

  it('returns the open label when not revealed', () => {
    expect(revealLabelKey(false)).toBe('Swipe down to scan');
  });
});

describe('canPanBegin', () => {
  describe('closed: opening only from the top of the list, dragging down', () => {
    it('claims the drag when at the top and pulling down', () => {
      expect(canPanBegin(false, 0, 10)).toBe(true);
    });

    it('claims the drag when scrolled past the top (rubber-banding) and pulling down', () => {
      expect(canPanBegin(false, -5, 10)).toBe(true);
    });

    it('leaves the drag to the list when scrolled down and pulling down (should scroll up)', () => {
      expect(canPanBegin(false, 40, 10)).toBe(false);
    });

    it('leaves the drag to the list when at the top but dragging up', () => {
      expect(canPanBegin(false, 0, -10)).toBe(false);
    });

    it('leaves the drag to the list on a zero-translation frame', () => {
      expect(canPanBegin(false, 0, 0)).toBe(false);
    });
  });

  describe('revealed: closing only on an upward drag, any scroll offset', () => {
    it('claims the drag when dragging up, list at top', () => {
      expect(canPanBegin(true, 0, -10)).toBe(true);
    });

    it('claims the drag when dragging up even if the list is scrolled down', () => {
      expect(canPanBegin(true, 120, -10)).toBe(true);
    });

    it('leaves the drag to the list when dragging down', () => {
      expect(canPanBegin(true, 0, 10)).toBe(false);
    });

    it('leaves the drag to the list on a zero-translation frame', () => {
      expect(canPanBegin(true, 0, 0)).toBe(false);
    });
  });
});

describe('resolveGestureEnd', () => {
  it('never toggles when the gate never passed, even if translation/velocity look decisive', () => {
    expect(resolveGestureEnd(false, false, 200, 2000)).toBe(false);
    expect(resolveGestureEnd(false, true, -200, -2000)).toBe(true);
  });

  it('falls through to nextRevealState once the gate passed at least once', () => {
    expect(resolveGestureEnd(true, false, 120, 0)).toBe(true);
    expect(resolveGestureEnd(true, true, -120, 0)).toBe(false);
  });

  it('regression: the gate failing on the release frame (jitter) does not undo an in-progress open', () => {
    // The drag legitimately passed canPanBegin earlier in the gesture (everPassed=true), but the
    // very last sampled frame at lift-off reads translationY <= 0 (touch-sample noise) — the
    // reveal decision must still be based on nextRevealState's own threshold/velocity check, not
    // silently discarded the way an unconditional re-check of canPanBegin at onEnd would.
    expect(resolveGestureEnd(true, false, 95, 0)).toBe(true);
  });
});
