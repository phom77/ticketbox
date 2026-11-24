import { useEffect, useState } from 'react';
import { getDiscoveryFacets, type DiscoveryFacets } from '../../api/performances';

const none: DiscoveryFacets = { cities: [], categories: [] };
let cached: Promise<DiscoveryFacets> | undefined;

/** City and category values that have upcoming events. Failures leave the lists empty. */
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
