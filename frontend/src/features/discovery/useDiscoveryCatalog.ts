import { useEffect, useState } from 'react';
import { getConcerts, type Page } from '../../api/concerts';
import { listEvents } from '../../api/performances';
import { isRequestCanceled } from '../../api/client';
import type { DiscoveryConcert } from './filters';

type Feed = {
  concerts: DiscoveryConcert[];
  nextPage: number | null;
};

export type DiscoveryCatalog = { legacy: Feed; native: Feed };

const emptyFeed: Feed = { concerts: [], nextPage: 0 };
const pageSize = 24;

const loadLegacy = (page: number, signal: AbortSignal) => getConcerts(page, pageSize, signal);

async function loadNative(page: number, signal: AbortSignal): Promise<Page<DiscoveryConcert>> {
  const response = await listEvents(page, signal, pageSize);
  const content = response.content.flatMap((event) => event.performances
    .filter((show) => !show.legacyConcertId)
    .map((show) => ({
      id: show.id,
      title: event.title,
      venueName: show.venueName,
      eventDate: show.startsAt,
      saleStartAt: show.saleStartAt,
      saleEndAt: show.saleEndAt,
      status: show.status,
      posterUrl: null,
      performance: { eventId: event.id, salesSuspended: show.salesSuspended },
    })));
  return { ...response, content };
}

function useCatalogFeed(
  load: (page: number, signal: AbortSignal) => Promise<Page<DiscoveryConcert>>,
  initial: Feed | undefined,
  enabled: boolean,
) {
  const [feed, setFeed] = useState(initial ?? emptyFeed);
  const [requestedPage, setRequestedPage] = useState(enabled && !initial ? 0 : null);
  const [failedPage, setFailedPage] = useState<number | null>(null);

  useEffect(() => {
    if (requestedPage === null) return;
    const controller = new AbortController();
    const page = requestedPage;
    void load(page, controller.signal).then((response) => {
      if (controller.signal.aborted) return;
      setFeed((current) => {
        const concerts = new Map(current.concerts.map((concert) => [concert.id, concert]));
        for (const concert of response.content) concerts.set(concert.id, concert);
        const hasMore = response.last === false || (response.last == null && page + 1 < response.totalPages);
        return {
          concerts: [...concerts.values()],
          nextPage: hasMore ? (response.number ?? page) + 1 : null,
        };
      });
      setFailedPage(null);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted && !isRequestCanceled(error)) setFailedPage(page);
    }).finally(() => {
      if (!controller.signal.aborted) setRequestedPage(null);
    });

    return () => controller.abort();
  }, [load, requestedPage]);

  function loadMore() {
    if (requestedPage !== null || feed.nextPage === null) return;
    setFailedPage(null);
    setRequestedPage(feed.nextPage);
  }

  return { feed, requestedPage, failedPage, loadMore };
}

export function useDiscoveryCatalog(initial?: DiscoveryCatalog, enabled = true) {
  const legacy = useCatalogFeed(loadLegacy, initial?.legacy, enabled);
  const native = useCatalogFeed(loadNative, initial?.native, enabled);
  const requestedPage = native.requestedPage === 0 ? 0 : legacy.requestedPage ?? native.requestedPage;
  const failedPage = native.failedPage === 0 ? 0 : legacy.failedPage ?? native.failedPage;

  function loadMore() {
    if (requestedPage !== null) return;
    if (failedPage === null || legacy.failedPage !== null) legacy.loadMore();
    if (failedPage === null || native.failedPage !== null) native.loadMore();
  }

  return {
    catalog: { legacy: legacy.feed, native: native.feed },
    concerts: [...legacy.feed.concerts, ...native.feed.concerts],
    hasMore: legacy.feed.nextPage !== null || native.feed.nextPage !== null,
    requestedPage, failedPage, loadMore,
  };
}
