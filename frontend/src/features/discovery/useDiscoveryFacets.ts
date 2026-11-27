import { useEffect, useState } from 'react';
import { getDiscoveryFacets, type DiscoveryFacets } from '../../api/performances';

const none: DiscoveryFacets = { cities: [], segments: [], genres: [], categories: [] };
const cache = new Map<string, Promise<DiscoveryFacets>>();

/**
 * City, segment and genre values that have upcoming events. With a segment, the genre counts cover the events of that
 * segment only (primary genre or tag). Failures leave the lists empty.
 */
export function useDiscoveryFacets(segment = '') {
  const [facets, setFacets] = useState(none);
  useEffect(() => {
    let active = true;
    let request = cache.get(segment);
    if (!request) {
      request = getDiscoveryFacets(segment).catch(() => {
        cache.delete(segment);
        return none;
      });
      cache.set(segment, request);
    }
    void request.then((value) => {
      if (active && value !== none) {
        setFacets({
          cities: Array.isArray(value.cities) ? value.cities : [],
          segments: Array.isArray(value.segments) ? value.segments : [],
          genres: Array.isArray(value.genres) ? value.genres : [],
          categories: Array.isArray(value.categories) ? value.categories : [],
        });
      }
    });
    return () => {
      active = false;
    };
  }, [segment]);
  return facets;
}

export function resetDiscoveryFacetsCache() {
  cache.clear();
}
