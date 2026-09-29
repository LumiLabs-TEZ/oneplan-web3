import { planningDayCountStore, usePlanningDayCountStore } from './planningDayCountStore';

beforeEach(() => {
  usePlanningDayCountStore.setState({ counts: {} });
});

describe('planningDayCountStore', () => {
  it('defaults to 1 for a trip that has never been touched', () => {
    expect(planningDayCountStore.get(1)).toBe(1);
  });

  it('bump grows and shrinks the count, never below 1', () => {
    planningDayCountStore.bump(1, 1);
    expect(planningDayCountStore.get(1)).toBe(2);
    planningDayCountStore.bump(1, 1);
    expect(planningDayCountStore.get(1)).toBe(3);
    planningDayCountStore.bump(1, -1);
    expect(planningDayCountStore.get(1)).toBe(2);
    planningDayCountStore.bump(1, -10);
    expect(planningDayCountStore.get(1)).toBe(1);
  });

  it('ensure raises the floor but never lowers it', () => {
    planningDayCountStore.ensure(1, 4);
    expect(planningDayCountStore.get(1)).toBe(4);
    planningDayCountStore.ensure(1, 2);
    expect(planningDayCountStore.get(1)).toBe(4);
  });

  it('keeps counts independent per tripId', () => {
    planningDayCountStore.bump(1, 2);
    planningDayCountStore.bump(2, 5);
    expect(planningDayCountStore.get(1)).toBe(3);
    expect(planningDayCountStore.get(2)).toBe(6);
  });

  it('is visible across separate reads (shared module-level state)', () => {
    planningDayCountStore.bump(7, 3);
    expect(usePlanningDayCountStore.getState().get(7)).toBe(4);
  });
});
