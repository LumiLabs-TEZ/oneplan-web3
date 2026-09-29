import { mrzDateToken, mrzLineOne, mrzLineTwo, mrzToken } from './mrz';

describe('mrzToken', () => {
  it('uppercases and collapses spaces to a single `<`', () => {
    expect(mrzToken('Danny Dinh')).toBe('DANNY<DINH');
  });

  it('strips Latin diacritics and folds Vietnamese Đ/đ to D/d', () => {
    expect(mrzToken('Nguyễn Văn A')).toBe('NGUYEN<VAN<A');
  });

  it('folds a leading Đ', () => {
    expect(mrzToken('Đinh Văn Long')).toBe('DINH<VAN<LONG');
  });

  it('collapses punctuation runs to a single `<`', () => {
    expect(mrzToken("O'Brien--Smith")).toBe('O<BRIEN<SMITH');
  });

  it('trims leading/trailing `<`', () => {
    expect(mrzToken('  Ken  ')).toBe('KEN');
  });

  it('falls back to MEMBER for an empty/unmappable name', () => {
    expect(mrzToken('')).toBe('MEMBER');
  });

  it('falls back to MEMBER when every character is non-alphanumeric', () => {
    expect(mrzToken('!!!')).toBe('MEMBER');
  });

  it('keeps digits', () => {
    expect(mrzToken('Agent 007')).toBe('AGENT<007');
  });
});

describe('mrzDateToken', () => {
  it('formats an ISO date as ddMMMyy uppercased', () => {
    expect(mrzDateToken('2025-01-01T00:00:00.000Z')).toBe('01JAN25');
  });

  it('formats a plain date-only ISO string', () => {
    expect(mrzDateToken('2026-03-25')).toBe('25MAR26');
  });

  it('falls back for null', () => {
    expect(mrzDateToken(null)).toBe('01JAN25');
  });

  it('falls back for an unparseable string', () => {
    expect(mrzDateToken('not-a-date')).toBe('01JAN25');
  });

  it('falls back for an empty string', () => {
    expect(mrzDateToken('')).toBe('01JAN25');
  });
});

describe('mrzLineOne', () => {
  it('is exactly 64 characters', () => {
    expect(mrzLineOne('Danny Dinh', '2025-01-01T00:00:00.000Z')).toHaveLength(64);
  });

  it('pads short content with `<`', () => {
    const line = mrzLineOne('Ken', null);
    expect(line).toHaveLength(64);
    expect(line.endsWith('<')).toBe(true);
    expect(line.startsWith('<<ALLTIME<<KEN<<MEMBERSINCE01JAN25<<ONEPLAN TRAVEL<<PASSPORT')).toBe(
      true,
    );
  });

  it('truncates content longer than 64 characters', () => {
    const line = mrzLineOne(
      'A Very Extremely Long Display Name That Exceeds The MRZ Budget',
      '2025-01-01T00:00:00.000Z',
    );
    expect(line).toHaveLength(64);
  });

  it('uses MEMBER fallback token for an empty name', () => {
    expect(mrzLineOne('', null)).toContain('<<MEMBER<<');
  });
});

describe('mrzLineTwo', () => {
  it('is exactly 54 characters', () => {
    expect(mrzLineTwo('2025-01-01T00:00:00.000Z')).toHaveLength(54);
  });

  it('starts with ISSUED{date}SGN', () => {
    expect(mrzLineTwo('2025-01-01T00:00:00.000Z').startsWith('ISSUED01JAN25SGN')).toBe(true);
  });

  it('ends with ONEPLAN TRAVEL when it fits', () => {
    expect(mrzLineTwo('2025-01-01T00:00:00.000Z').endsWith('ONEPLAN TRAVEL')).toBe(true);
  });

  it('falls back to 01JAN25 for null memberSince', () => {
    expect(mrzLineTwo(null).startsWith('ISSUED01JAN25SGN')).toBe(true);
  });

  it('always has at least one filler `<` between prefix and suffix', () => {
    const line = mrzLineTwo('2025-01-01T00:00:00.000Z');
    const prefix = 'ISSUED01JAN25SGN';
    expect(line.slice(prefix.length, prefix.length + 1)).toBe('<');
  });
});
