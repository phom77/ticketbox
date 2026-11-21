import { useEffect, useState } from 'react';
import { getConcerts, type ConcertSummary } from '../../api/concerts';
import { isRequestCanceled } from '../../api/client';

type Catalog = {
  concerts: ConcertSummary[];
  nextPage: number;
  hasMore: boolean;
};

const emptyCatalog: Catalog = { concerts: [], nextPage: 0, hasMore: true };
const pageSize = 24;

export function useDiscoveryCatalog(initial?: Catalog, enabled = true) {
  const [catalog, setCatalog] = useState(initial ?? emptyCatalog);
  const [requestedPage, setRequestedPage] = useState(enabled && !initial ? 0 : null);
  const [failedPage, setFailedPage] = useState<number | null>(null);

  useEffect(() => {
    if (requestedPage === null) return;
    const controller = new AbortController();
    const page = requestedPage;
    void getConcerts(page, pageSize, controller.signal).then((response) => {
      if (controller.signal.aborted) return;
      setCatalog((current) => {
        const concerts = new Map(current.concerts.map((concert) => [concert.id, concert]));
        for (const concert of response.content) concerts.set(concert.id, concert);
        return {
          concerts: [...concerts.values()],
          nextPage: (response.number ?? page) + 1,
          hasMore: response.last === false || (response.last == null && page + 1 < response.totalPages),
        };
      });
      setFailedPage(null);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted && !isRequestCanceled(error)) setFailedPage(page);
    }).finally(() => {
      if (!controller.signal.aborted) setRequestedPage(null);
    });

    return () => controller.abort();
  }, [requestedPage]);

  function loadMore() {
    if (requestedPage !== null || !catalog.hasMore) return;
    setFailedPage(null);
    setRequestedPage(catalog.nextPage);
  }

  return { catalog, requestedPage, failedPage, loadMore };
}

export type DiscoveryCatalog = Catalog;
