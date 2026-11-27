import { describe, expect, it } from 'vitest';

const sources = import.meta.glob(['../organizer/**/*.tsx', '../admin/**/*.tsx', '!**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('price fields', () => {
  it('has no raw number input for a price under pages/organizer and pages/admin', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10);
    const offenders = Object.entries(sources)
      .filter(
        ([, text]) =>
          /<input[^>]*type="number"[^>]*(price|\{\.\.\.field\('price'\)\})/is.test(text) ||
          /<input[^>]*name="price"[^>]*type="number"/is.test(text),
      )
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
