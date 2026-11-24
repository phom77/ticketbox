import { describe, expect, it } from 'vitest';
import { configuredHttpsUrl } from './configuredHttpsUrl';

describe('configuredHttpsUrl', () => {
  it('accepts an HTTPS destination and normalizes it', () => {
    expect(configuredHttpsUrl('https://help.example.com')).toBe('https://help.example.com/');
    expect(configuredHttpsUrl(' https://example.com/terms?lang=vi ')).toBe(
      'https://example.com/terms?lang=vi',
    );
  });

  it.each([
    ['an HTTP destination', 'http://help.example.com'],
    ['embedded credentials', 'https://user:secret@help.example.com'],
    ['a script URL', 'javascript:alert(1)'],
    ['an unparseable value', 'not a url'],
    ['a blank value', '   '],
    ['a missing value', undefined],
    ['a non-string value', 42],
  ])('rejects %s', (_case, value) => {
    expect(configuredHttpsUrl(value)).toBeNull();
  });
});
