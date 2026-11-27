import { useEffect, useState } from 'react';
import { listDisruptionRequests } from '../../api/performanceScheduling';

/** Number of open organizer requests, for the Requests tab badge. */
export function useOpenRequestCount() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    listDisruptionRequests('REQUESTED', controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setCount(items.length);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return count;
}
