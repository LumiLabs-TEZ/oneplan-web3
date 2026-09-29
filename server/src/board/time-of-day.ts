// Turn the verbatim time mention captured with a pin ("9am", "5:30pm", "sáng",
// "after lunch") into a 24-hour "HH:MM" plan-item start time. Returns undefined
// for anything it can't read so the caller can fall back to the AI's guess.

const WORD_TIMES: [RegExp, string][] = [
  // Order matters: more specific phrases before the bare words they contain.
  [/after\s+lunch|sau\s+(bữa\s+)?trưa|đầu\s+giờ\s+chiều/i, '13:30'],
  [/after\s+dinner|sau\s+(bữa\s+)?tối/i, '20:00'],
  [/\bbreakfast\b|bữa\s+sáng|\bmorning\b|sáng/i, '08:00'],
  [/\bbrunch\b/i, '10:00'],
  [/\blunch\b|\bnoon\b|midday|bữa\s+trưa|trưa/i, '12:00'],
  [/\bafternoon\b|chiều/i, '15:00'],
  [/\bsunset\b|hoàng\s+hôn|\bdusk\b/i, '17:30'],
  [/\bdinner\b|\bevening\b|bữa\s+tối|tối/i, '18:30'],
  [/\bmidnight\b|nửa\s+đêm/i, '23:30'],
  [/\bnight\b|đêm|khuya/i, '20:30'],
];

const pad = (n: number) => String(n).padStart(2, '0');

export function parseTimeOfDay(
  text: string | null | undefined,
): string | undefined {
  if (!text) return undefined;
  const t = text.trim().toLowerCase();
  if (!t) return undefined;

  // Clock forms: "9am", "9 am", "5:30pm", "17h", "17h30", "9:00", "09.30".
  const clock =
    /(\d{1,2})(?:[:.h](\d{2})?)?\s*(?:giờ\s*)?(am|pm|a\.m\.|p\.m\.|sáng|chiều|tối|đêm|trưa)?/i.exec(
      t,
    );
  if (clock && /\d/.test(t)) {
    let hour = Number(clock[1]);
    const minute = clock[2] ? Number(clock[2]) : 0;
    const suffix = clock[3]?.replace(/\./g, '');
    if (hour <= 24 && minute < 60) {
      const isPm =
        suffix === 'pm' ||
        suffix === 'chiều' ||
        suffix === 'tối' ||
        suffix === 'đêm';
      const isAm = suffix === 'am' || suffix === 'sáng';
      if (isPm && hour < 12) hour += 12;
      if (isAm && hour === 12) hour = 0;
      // "12 trưa" stays 12; an unsuffixed "5" alone is too ambiguous — only
      // accept unsuffixed values when minutes or an explicit 24h form ("17h",
      // "17:00") make the intent clear.
      if (suffix || clock[2] !== undefined || /\d{1,2}h/.test(t)) {
        if (hour === 24) hour = 0;
        return `${pad(hour)}:${pad(minute)}`;
      }
    }
  }

  for (const [re, time] of WORD_TIMES) {
    if (re.test(t)) return time;
  }
  return undefined;
}
