import { SETTING_SECTIONS, SETTINGS_URLS } from './sections';

describe('SETTING_SECTIONS', () => {
  it('has one section per SettingView.swift header, in order', () => {
    expect(SETTING_SECTIONS.map((s) => s.id)).toEqual(['personal', 'oneplan', 'about', 'danger']);
  });

  it('lists every row id exactly once, matching the brief', () => {
    const rowIds = SETTING_SECTIONS.flatMap((s) => s.rows.map((r) => r.id));
    expect(rowIds).toEqual([
      'displayName',
      'currency',
      'language',
      'tripTips',
      'privacy',
      'terms',
      'rate',
      'support',
      'logout',
      'delete',
    ]);
  });

  it('keeps the dynamic UMP privacy row outside static sections', () => {
    const rowIds = SETTING_SECTIONS.flatMap((s) => s.rows.map((r) => r.id));
    expect(rowIds).not.toContain('adPrivacy');
  });

  it('marks only delete as destructive', () => {
    const destructiveIds = SETTING_SECTIONS.flatMap((s) =>
      s.rows.filter((r) => r.destructive).map((r) => r.id),
    );
    expect(destructiveIds).toEqual(['delete']);
  });

  it('marks disclosure on currency/language/privacy/terms/rate/support only', () => {
    const disclosureIds = SETTING_SECTIONS.flatMap((s) =>
      s.rows.filter((r) => r.disclosure).map((r) => r.id),
    );
    expect(disclosureIds).toEqual([
      'currency',
      'language',
      'privacy',
      'terms',
      'rate',
      'support',
    ]);
  });
});

describe('SETTINGS_URLS', () => {
  it('matches the iOS URLs', () => {
    expect(SETTINGS_URLS).toEqual({
      privacy: 'https://oneplan.space/privacy-policy',
      terms: 'https://oneplan.space/termandconditions',
      support: 'https://t.me/+C6MDB5xslyRlZTZl',
    });
  });
});
