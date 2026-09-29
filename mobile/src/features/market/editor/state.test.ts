import { editorState, editorReducer, isDirty, validationErrors, type Document } from './state';
const doc: Document = {
  fields: { name: 'Da Lat', countryId: 1, durationDays: 3, price: 100, tags: ['FRIENDS'] },
  activities: [
    { key: 'a', dayNumber: 1, title: 'A', imageUrls: ['a', 'b'] },
    { key: 'b', dayNumber: 2, title: 'B' },
    { key: 'c', dayNumber: 3, title: 'C' },
  ],
};
it('tracks field, cover, activity and image order changes against the saved baseline', () => {
  const state = editorState(doc);
  expect(isDirty(state)).toBe(false);
  for (const action of [
    { type: 'fields', fields: { name: 'Updated' } },
    { type: 'cover', uri: 'file://cover' },
    { type: 'activity', activity: { key: 'a', dayNumber: 1, title: 'Changed' } },
    { type: 'images', key: 'a', images: ['b', 'a'] },
  ] as const) {
    const changed = editorReducer(
      state,
      action.type === 'images' ? { ...action, images: [...action.images] } : action,
    );
    expect(isDirty(changed)).toBe(true);
    expect(isDirty(editorReducer(changed, { type: 'saved' }))).toBe(false);
  }
  expect(isDirty(state)).toBe(false);
});
it('deletes activities on the removed day and remaps following days', () => {
  const state = editorReducer(editorState(doc), { type: 'removeDay', day: 2 });
  expect(state.current.fields.durationDays).toBe(2);
  expect(state.current.activities.map((a) => [a.key, a.dayNumber])).toEqual([
    ['a', 1],
    ['c', 2],
  ]);
});
it('keeps duration inside 1–30', () => {
  const one = editorState({ ...doc, fields: { ...doc.fields, durationDays: 1 } });
  expect(editorReducer(one, { type: 'removeDay', day: 1 })).toBe(one);
  const thirty = editorState({ ...doc, fields: { ...doc.fields, durationDays: 30 } });
  expect(editorReducer(thirty, { type: 'addDay' })).toBe(thirty);
});
it('requires destination, name, valid budget and activities for publishing', () => {
  expect(validationErrors(doc, true)).toEqual([]);
  expect(validationErrors({ ...doc, activities: [] }, true)).not.toHaveLength(0);
  expect(validationErrors({ ...doc, activities: [] }, false)).toEqual([]);
  const zeroBudget = { ...doc, fields: { ...doc.fields, price: 0 } };
  expect(validationErrors(zeroBudget, false)).toEqual([]);
  expect(validationErrors(zeroBudget, true)).toContain('Invalid budget');
  expect(
    validationErrors({ ...doc, fields: { ...doc.fields, price: NaN } }, false),
  ).not.toHaveLength(0);
});

it('does not mark edits made during an in-flight save as saved', () => {
  const state = editorState(doc);
  const edited = editorReducer(state, { type: 'fields', fields: { name: 'Updated during save' } });
  expect(isDirty(editorReducer(edited, { type: 'saved', document: doc }))).toBe(true);
});

it('reorders activities only within their day and produces consecutive sort orders', () => {
  const state = editorState({
    ...doc,
    activities: [
      { key: 'a', dayNumber: 1, title: 'A', sortOrder: 4 },
      { key: 'b', dayNumber: 1, title: 'B', sortOrder: 8 },
      { key: 'c', dayNumber: 2, title: 'C', sortOrder: 0 },
    ],
  });
  const moved = editorReducer(state, { type: 'moveActivity', key: 'b', offset: -1 });
  expect(moved.current.activities.map((a) => [a.key, a.sortOrder])).toEqual([
    ['a', 1],
    ['b', 0],
    ['c', 0],
  ]);
  expect(isDirty(moved)).toBe(true);
});
