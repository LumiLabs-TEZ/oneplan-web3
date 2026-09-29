import {
  dragProgress,
  hapticsToFire,
  hasOngoingConflict,
  MAX_DRAG,
  milestoneIndex,
  shouldJoin,
  topPillHeight,
} from './dragToJoin';

describe('dragProgress', () => {
  it('clamps to 0…1', () => {
    expect(dragProgress(-40)).toBe(0);
    expect(dragProgress(0)).toBe(0);
    expect(dragProgress(MAX_DRAG / 2)).toBeCloseTo(0.5);
    expect(dragProgress(MAX_DRAG)).toBe(1);
    expect(dragProgress(MAX_DRAG * 3)).toBe(1);
  });
});

describe('milestoneIndex', () => {
  it('steps 0 → 3 at .33 / .66 / .95', () => {
    expect(milestoneIndex(0.2)).toBe(0);
    expect(milestoneIndex(0.33)).toBe(1);
    expect(milestoneIndex(0.5)).toBe(1);
    expect(milestoneIndex(0.7)).toBe(2);
    expect(milestoneIndex(0.95)).toBe(3);
    expect(milestoneIndex(1)).toBe(3);
  });
});

describe('hapticsToFire', () => {
  it('fires one tick per crossed milestone and never goes backwards', () => {
    expect(hapticsToFire(1, 3)).toBe(2);
    expect(hapticsToFire(0, 1)).toBe(1);
    expect(hapticsToFire(2, 2)).toBe(0);
    expect(hapticsToFire(2, 1)).toBe(0);
  });
});

describe('topPillHeight', () => {
  it('shrinks with the drag but never below 60', () => {
    expect(topPillHeight(0)).toBe(310);
    expect(topPillHeight(100)).toBe(210);
    expect(topPillHeight(MAX_DRAG)).toBe(60);
    expect(topPillHeight(1000)).toBe(60);
  });
});

describe('shouldJoin', () => {
  it('needs 95% of the track', () => {
    expect(shouldJoin(0.949)).toBe(false);
    expect(shouldJoin(0.95)).toBe(true);
    expect(shouldJoin(1)).toBe(true);
  });
});

describe('hasOngoingConflict', () => {
  it('only conflicts when the invited trip is ONGOING and the user already has one', () => {
    expect(hasOngoingConflict('ONGOING', 1)).toBe(true);
    expect(hasOngoingConflict('ONGOING', 0)).toBe(false);
    expect(hasOngoingConflict('PLANNING', 1)).toBe(false);
    expect(hasOngoingConflict('ENDED', 2)).toBe(false);
    expect(hasOngoingConflict(undefined, 1)).toBe(false);
  });
});
