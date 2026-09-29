import { useActivityDraft } from './activityDraft';
it('hands an activity result only to its originating editor session', () => {
  const store = useActivityDraft.getState();
  store.begin('first', { key: 'a', dayNumber: 1, title: 'Original' });
  store.finish({ kind: 'save', activity: { key: 'a', dayNumber: 1, title: 'Changed' } });
  expect(store.consume('second')).toBeNull();
  expect(store.consume('first')).toMatchObject({ kind: 'save', activity: { title: 'Changed' } });
  expect(store.consume('first')).toBeNull();
});
it('clears transient activity content when its editor is removed', () => {
  const store = useActivityDraft.getState();
  store.begin('first', { key: 'a', dayNumber: 1, title: 'Original' });
  store.clear('second');
  expect(useActivityDraft.getState().original).not.toBeNull();
  store.clear('first');
  expect(useActivityDraft.getState().original).toBeNull();
});
it('carries the day count and new/edit mode to the activity screen', () => {
  const store = useActivityDraft.getState();
  store.begin('first', { key: 'a', dayNumber: 2, title: 'Edit me' }, { dayCount: 3, isNew: false });
  expect(useActivityDraft.getState()).toMatchObject({ dayCount: 3, isNew: false });
  store.begin('first', { key: 'b', dayNumber: 1, title: '' });
  expect(useActivityDraft.getState()).toMatchObject({ dayCount: 1, isNew: true });
});
