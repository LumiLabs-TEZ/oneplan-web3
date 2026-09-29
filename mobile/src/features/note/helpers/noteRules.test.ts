import {
  canSaveNote,
  noteDateLabel,
  normalizeNoteInput,
  toCreateBody,
  toUpdateBody,
} from './noteRules';

describe('normalizeNoteInput', () => {
  it('trims title and body', () => {
    expect(normalizeNoteInput('  Hello  ', '  World  ')).toEqual({
      title: 'Hello',
      body: 'World',
    });
  });

  it('allows an empty trimmed body', () => {
    expect(normalizeNoteInput('Title', '   ')).toEqual({ title: 'Title', body: '' });
  });
});

describe('canSaveNote', () => {
  it('is false for empty or whitespace-only title', () => {
    expect(canSaveNote('')).toBe(false);
    expect(canSaveNote('   ')).toBe(false);
  });

  it('is true once the trimmed title is non-empty', () => {
    expect(canSaveNote('  Hi  ')).toBe(true);
  });
});

describe('toCreateBody', () => {
  it('omits body when empty', () => {
    expect(toCreateBody('  Title  ', '   ')).toEqual({ title: 'Title', isDone: false });
  });

  it('includes trimmed body when non-empty', () => {
    expect(toCreateBody('Title', '  Body  ', true)).toEqual({
      title: 'Title',
      body: 'Body',
      isDone: true,
    });
  });
});

describe('toUpdateBody', () => {
  it('sends an explicit empty string when body is cleared', () => {
    expect(toUpdateBody('Title', '   ', false)).toEqual({
      title: 'Title',
      body: '',
      isDone: false,
    });
  });

  it('sends the trimmed body when non-empty', () => {
    expect(toUpdateBody('  Title  ', '  Body  ', true)).toEqual({
      title: 'Title',
      body: 'Body',
      isDone: true,
    });
  });
});

describe('noteDateLabel', () => {
  it('formats as dd/MM in local time', () => {
    expect(noteDateLabel('2026-01-05T10:00:00.000Z')).toBe(
      new Date('2026-01-05T10:00:00.000Z').getDate().toString().padStart(2, '0') +
        '/' +
        (new Date('2026-01-05T10:00:00.000Z').getMonth() + 1).toString().padStart(2, '0'),
    );
  });

  it('tolerates fractional-second timestamps', () => {
    const withMs = noteDateLabel('2026-09-16T08:30:29.123Z');
    const withoutMs = noteDateLabel('2026-09-16T08:30:29Z');
    expect(withMs).toBe(withoutMs);
  });

  it('pads single-digit day and month', () => {
    expect(noteDateLabel('2026-03-05T00:00:00Z')).toMatch(/^\d{2}\/\d{2}$/);
  });
});
