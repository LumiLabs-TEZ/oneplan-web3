import { noteSwipeDestination } from './noteSwipe';

test('only a released long swipe deletes, never a short fast flick', () => {
  expect(noteSwipeDestination(-240, 360, 0)).toBe('delete');
  expect(noteSwipeDestination(-30, 360, -1800)).toBe('reveal');
  expect(noteSwipeDestination(-90, 360, 0)).toBe('reveal');
  expect(noteSwipeDestination(-15, 360, 0)).toBe('close');
  expect(noteSwipeDestination(-90, 360, 1500)).toBe('close');
  expect(noteSwipeDestination(-500, 0, 0)).not.toBe('delete');
});
