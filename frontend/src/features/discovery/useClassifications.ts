import { useEffect, useState } from 'react';
import { getClassifications } from '../../api/performances';
import { classificationSegments, type ClassificationSegment } from './classification';

let cached: Promise<ClassificationSegment[] | null> | undefined;

/**
 * The active segments and genres. The bundled list is used until Catalog answers, and when it cannot, so pickers always
 * have options; Catalog's answer then hides genres it has retired.
 */
export function useClassifications() {
  const [segments, setSegments] = useState(classificationSegments);
  useEffect(() => {
    let active = true;
    cached ??= getClassifications()
      .then((value) =>
        value.segments.map((segment) => ({
          id: segment.id,
          genres: [...segment.genres]
            .sort((a, b) => a.sort - b.sort)
            .map((genre) => ({ id: genre.id, popular: genre.popular })),
        })),
      )
      .catch(() => {
        cached = undefined;
        return null;
      });
    void cached.then((value) => {
      if (active && value && value.length > 0) setSegments(value);
    });
    return () => {
      active = false;
    };
  }, []);
  return segments;
}

export function resetClassificationsCache() {
  cached = undefined;
}
