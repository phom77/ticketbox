import { describe, expect, it } from 'vitest';
import type { SaleDraft } from '../../api/performanceManagement';
import { applyPreset } from '../../features/performance/saleWindowPresets';
import { inspectSaleDraft } from './performanceSaleReview';

const sale: SaleDraft = {
  version: 1,
  groups: [
    { id: 'g1', sectionId: null, sectionLabel: 'Floor', kind: 'GA', capacity: 100, seats: [] },
  ],
  offers: [
    {
      id: 'o1',
      groupId: 'g1',
      name: 'Standard',
      price: 100000,
      currency: 'VND',
      active: true,
      saleStartAt: '2030-01-01T00:00:00.000Z',
      saleEndAt: '2030-02-01T00:00:00.000Z',
    },
  ],
};

describe('a draft without a sale start', () => {
  const performance = { saleStartAt: null, saleEndAt: '2030-03-01T00:00:00.000Z' };

  it('skips the window check and reports the missing sale start', () => {
    const result = inspectSaleDraft(null, sale, performance, Date.parse('2029-12-01T00:00:00Z'));
    expect(result.saveIssue).toBeNull();
    expect(result.publishIssues).toContain('reviewMissingSaleStart');
  });

  it('does not report it once the sale start is set', () => {
    const result = inspectSaleDraft(
      null,
      sale,
      { ...performance, saleStartAt: '2029-12-15T00:00:00.000Z' },
      Date.parse('2029-12-01T00:00:00Z'),
    );
    expect(result.publishIssues).not.toContain('reviewMissingSaleStart');
  });

  it('still derives a ticket type window for a preset', () => {
    const result = applyPreset('whole', { ...performance, timezone: 'Asia/Ho_Chi_Minh' });
    expect(result.ok).toBe(true);
  });
});
