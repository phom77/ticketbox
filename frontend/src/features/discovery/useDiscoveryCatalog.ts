import { useEffect, useState } from 'react';
import { getDiscoveryEvents } from '../../api/performances';
import { isRequestCanceled } from '../../api/client';
import type { DiscoveryConcert } from './filters';

export type DiscoveryCatalog = {
  concerts: DiscoveryConcert[];
  total: number;
  nextPage: number | null;
};

const emptyCatalog: DiscoveryCatalog = { concerts: [], total: 0, nextPage: 0 };

export function useDiscoveryCatalog(
  search: string,
  initial: DiscoveryCatalog | undefined,
  enabled: boolean,
) {
  const [catalog, setCatalog] = useState(initial ?? emptyCatalog);
  const [requestedPage, setRequestedPage] = useState(enabled && !initial ? 0 : null);
  const [failedPage, setFailedPage] = useState<number | null>(null);

  useEffect(() => {
    if (requestedPage === null) return;
    const controller = new AbortController();
    const page = requestedPage;
    void getDiscoveryEvents(search, page, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setCatalog((current) => {
          const byEvent = new Map(
            current.concerts.map((event) => [event.performance?.eventId ?? event.id, event]),
          );
          for (const { eventId, salesSuspended, ...show } of response.content) {
            byEvent.set(eventId ?? show.id, {
              ...show,
              performance: eventId ? { eventId, salesSuspended } : undefined,
            });
          }
          return {
            concerts: [...byEvent.values()],
            total: response.totalElements,
            nextPage: response.last ? null : page + 1,
          };
        });
        setFailedPage(null);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && !isRequestCanceled(error)) setFailedPage(page);
      })
      .finally(() => {
        if (!controller.signal.aborted) setRequestedPage(null);
      });
    return () => controller.abort();
  }, [requestedPage, search]);

  function loadMore() {
    if (requestedPage !== null || catalog.nextPage === null) return;
    setFailedPage(null);
    setRequestedPage(catalog.nextPage);
  }

  return { catalog, requestedPage, failedPage, loadMore };
}
