import { normaliseSearch } from './headerSearch';

/**
 * Buyer-facing event categories, in header order. Ids are the values Catalog stores in
 * `events.category` and matches case-insensitively in discovery.
 */
export const eventCategories = [
  { id: 'concerts', label: 'shared:category_concerts' },
  { id: 'festivals', label: 'shared:category_festivals' },
  { id: 'sports', label: 'shared:category_sports' },
  { id: 'arts-theater', label: 'shared:category_artsTheater' },
  { id: 'comedy', label: 'shared:category_comedy' },
  { id: 'family', label: 'shared:category_family' },
] as const;

/** The translation key for a category id, or null for a category outside the list. */
export function categoryLabelKey(category: string) {
  const id = category.trim().toLowerCase();
  return eventCategories.find((entry) => entry.id === id)?.label ?? null;
}

/** The label to show for a category id: translated for a known id, otherwise the id as plain words. */
export function categoryText(category: string, translate: (key: string) => string) {
  const key = categoryLabelKey(category);
  return key ? translate(key) : category.replace(/[_-]/g, ' ');
}

/** The known city the buyer typed (ignoring case and Vietnamese marks), if any. */
export function matchCity(value: string, cities: readonly string[]) {
  // "Hà Nội", "ha noi" and "Hanoi" all name the same city.
  const compact = (text: string) => normaliseSearch(text).replace(/\s/g, '');
  const wanted = compact(value);
  if (!wanted) return null;
  return cities.find((city) => compact(city) === wanted) ?? null;
}
