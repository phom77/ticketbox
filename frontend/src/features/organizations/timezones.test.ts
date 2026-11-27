import { describe, expect, it } from 'vitest';
import { filterTimezones, timezoneOptions } from './timezones';

describe('timezones', () => {
  it('lists zones with their UTC offset and always includes the selected one', () => {
    const options = timezoneOptions('Asia/Ho_Chi_Minh', new Date('2026-12-01T00:00:00Z'));
    expect(options.find((option) => option.value === 'Asia/Ho_Chi_Minh')?.label).toBe(
      'Asia/Ho_Chi_Minh (UTC+07:00)',
    );
    expect(options.find((option) => option.value === 'UTC')).toBeDefined();
  });

  it('filters by name or offset but keeps the selected zone', () => {
    const options = timezoneOptions('Asia/Ho_Chi_Minh', new Date('2026-12-01T00:00:00Z'));
    const found = filterTimezones(options, 'bangkok', 'Asia/Ho_Chi_Minh').map((o) => o.value);
    expect(found).toContain('Asia/Bangkok');
    expect(found).toContain('Asia/Ho_Chi_Minh');
    expect(found).not.toContain('Europe/Paris');
  });
});
