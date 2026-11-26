import { describe, expect, it } from 'vitest';
import {
  contentDifferences,
  cleanTranslations,
  contentInput,
  emptyForm,
  formFromContent,
  openRevision,
  posterProblem,
  posterMaxBytes,
  revisionInput,
  sameContent,
} from './eventContent';

describe('content review differences', () => {
  const live = {
    title: 'Live',
    description: 'Old',
    translations: { vi: { title: 'Sống', description: null } },
    artistBio: null,
    ageRating: null,
    refundPolicy: null,
    posterUrl: 'https://cdn.test/live.png',
  };
  const content = {
    title: 'Live',
    description: 'New',
    translations: {
      vi: { title: 'Sống', description: null },
      en: { title: 'Live', description: null },
    },
    artistBio: null,
    ageRating: '16+' as const,
    refundPolicy: null,
  };

  it('marks only the fields that differ', () => {
    const changed = contentDifferences(live, { content, posterUrl: null, posterChanged: false })
      .filter((entry) => entry.changed)
      .map((entry) => entry.field);
    expect(changed).toEqual(['description', 'translationEn', 'ageRating']);
  });

  it('compares the staged poster, including its removal', () => {
    const base = { content, posterUrl: 'https://cdn.test/new.png', posterChanged: true };
    expect(contentDifferences(live, base).find((entry) => entry.field === 'poster')?.changed).toBe(
      true,
    );
    const removed = { content, posterUrl: null, posterChanged: true };
    expect(contentDifferences(live, removed).find((e) => e.field === 'poster')?.proposed).toBe('');
  });
});

describe('event content helpers', () => {
  it('drops languages without text and trims the rest', () => {
    expect(
      cleanTranslations({
        vi: { title: '  Đêm nhạc ', description: ' ' },
        en: { title: null, description: '' },
      }),
    ).toEqual({ vi: { title: 'Đêm nhạc', description: null } });
  });

  it('builds the request from the form without blanks', () => {
    const form = { ...emptyForm, title: ' Show ', ageRating: '16+' as const, refundPolicy: ' ' };
    expect(contentInput(form)).toEqual({
      title: 'Show',
      description: '',
      translations: {},
      artistBio: '',
      ageRating: '16+',
      refundPolicy: '',
    });
    expect(revisionInput(form).ageRating).toBe('16+');
  });

  it('starts a form from an event and compares by content', () => {
    const form = formFromContent({ title: 'A', description: null, category: ' Concerts ' });
    expect(form.category).toBe('concerts');
    expect(sameContent(form, { ...form, description: '  ' })).toBe(true);
    expect(sameContent(form, { ...form, refundPolicy: 'x' })).toBe(false);
    expect(sameContent(form, { ...form, category: 'sports' })).toBe(false);
  });

  it('accepts only supported poster files within the size limit', () => {
    const image = (type: string, size = 10) => new File([new Uint8Array(size)], 'p', { type });
    expect(posterProblem(image('image/png'))).toBeNull();
    expect(posterProblem(image('image/webp'))).toBeNull();
    expect(posterProblem(image('image/gif'))).toBe('type');
    expect(posterProblem(image('image/jpeg', posterMaxBytes + 1))).toBe('size');
  });

  it('treats an approved revision as no open change', () => {
    expect(openRevision('DRAFTING')).toBe(true);
    expect(openRevision('REJECTED')).toBe(true);
    expect(openRevision('APPROVED')).toBe(false);
    expect(openRevision(null)).toBe(false);
  });
});
