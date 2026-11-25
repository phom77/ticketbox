import { describe, expect, it } from 'vitest';
import { categoryLabelKey, categoryText, eventCategories } from './categories';

describe('event categories', () => {
  it('matches the six ids Catalog accepts', () => {
    // Keep in sync with EventCategoryTest in services/catalog.
    expect(eventCategories.map((entry) => entry.id)).toEqual([
      'concerts',
      'festivals',
      'sports',
      'arts-theater',
      'comedy',
      'family',
    ]);
  });

  it('translates known ids and shows other text as plain words', () => {
    const translate = (key: string) => `t:${key}`;
    expect(categoryLabelKey('Sports')).toBe('shared:category_sports');
    expect(categoryText('arts-theater', translate)).toBe('t:shared:category_artsTheater');
    expect(categoryText('street_food', translate)).toBe('street food');
  });
});
