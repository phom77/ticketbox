import { useEffect, useState } from 'react';
import { getDiscoveryFacets, type DiscoveryFacets } from '../../api/performances';

const none: DiscoveryFacets = { cities: [], segments: [], genres: [], categories: [] };
let cached: Promise<DiscoveryFacets> | undefined;

/** City, segment and genre values that have upcoming events. Failures leave the lists empty. */
export function useDiscoveryFacets() {
  const [facets, setFacets] = useState(none);
  useEffect(() => {
    let active = true;
    cached ??= getDiscoveryFacets().catch(() => {
      cached = undefined;
      return none;
    });
    void cached.then((value) => {
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
  }, []);
  return facets;
}

export function resetDiscoveryFacetsCache() {
  cached = undefined;
}
