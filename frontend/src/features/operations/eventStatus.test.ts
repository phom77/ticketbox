import { describe, expect, it } from 'vitest';
import { eventStatusKey } from './eventStatus';

describe('eventStatusKey', () => {
  it('maps each directory status to its label', () => {
    expect(eventStatusKey('IN_REVIEW')).toBe('concert-directory:statusInReview');
    expect(eventStatusKey('ON_SALE')).toBe('concert-directory:statusOnSale');
    expect(eventStatusKey('SOLD_OUT')).toBe('concert-directory:statusSoldOut');
    expect(eventStatusKey('PAST')).toBe('concert-directory:statusPast');
  });

  it('shows anything unknown as a draft', () => {
    expect(eventStatusKey('DRAFT')).toBe('concert-directory:statusDraft');
    expect(eventStatusKey('something-else')).toBe('concert-directory:statusDraft');
  });
});
