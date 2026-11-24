import { useEffect, useRef, useState } from 'react';
import { getDiscoveryEvents } from '../../api/performances';
import { isRequestCanceled } from '../../api/client';
import type { DiscoveryConcert } from './filters';

export type DiscoveryCatalog = {
  concerts: DiscoveryConcert[];
  total: number;
  nextPage: number | null;
};

const emptyCatalog: DiscoveryCatalog = { concerts: [], total: 0, nextPage: 0 };

type Loaded = { search: string; catalog: DiscoveryCatalog };

/**
 * Loads Catalog discovery pages for one filter query. The hook stays mounted when the query
 * changes: the previous results remain visible (loading is true) until the first page of the new
 * query arrives. `depth` is how many pages the URL asks for; they are fetched in order on entry.
 */
export function useDiscoveryCatalog(
  search: string,
  depth: number,
  initial: DiscoveryCatalog | undefined,
  onDepth: (pages: number) => void,
) {
  const [loaded, setLoaded] = useState<Loaded>({ search, catalog: initial ?? emptyCatalog });
  const [failure, setFailure] = useState<{ search: string; page: number } | null>(null);
  const [requestedPage, setRequestedPage] = useState<number | null>(initial ? null : 0);
  const entryDepth = useRef(depth);
  const reported = useRef(onDepth);
  reported.current = onDepth;
  const current = useRef(loaded);
  current.current = loaded;

  const queryChanged = loaded.search !== search;
  const failed = failure?.search === search ? failure : null;
  // A different query always restarts from page 0 while the old results stay on screen.
  const pending = failed ? null : queryChanged ? 0 : requestedPage;

  useEffect(() => {
    if (pending === null) return;
    const controller = new AbortController();
    const page = pending;
    void getDiscoveryEvents(search, page, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        const base = page === 0 ? [] : current.current.catalog.concerts;
        const byEvent = new Map(
          base.map((event) => [event.performance?.eventId ?? event.id, event]),
        );
        for (const { eventId, salesSuspended, ...show } of response.content) {
          byEvent.set(eventId ?? show.id, {
            ...show,
            performance: eventId ? { eventId, salesSuspended } : undefined,
          });
        }
        const next: DiscoveryCatalog = {
          concerts: [...byEvent.values()],
          total: response.totalElements,
          nextPage: response.last ? null : page + 1,
        };
        setLoaded({ search, catalog: next });
        setFailure(null);
        const target = entryDepth.current;
        if (next.nextPage !== null && page + 1 < target) {
          setRequestedPage(page + 1);
        } else {
          setRequestedPage(null);
          entryDepth.current = 1;
          if (page > 0 || target > 1) reported.current(page + 1);
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isRequestCanceled(error)) return;
        setFailure({ search, page });
        setRequestedPage(null);
        entryDepth.current = 1;
      });
    return () => controller.abort();
  }, [pending, search]);

  function loadMore() {
    const { nextPage } = loaded.catalog;
    if (pending !== null || nextPage === null || queryChanged) return;
    setFailure(null);
    setRequestedPage(nextPage);
  }

  function retry() {
    setRequestedPage(failed?.page ?? 0);
    setFailure(null);
  }

  return {
    catalog: loaded.catalog,
    requestedPage: pending,
    failedPage: failed?.page ?? null,
    loadMore,
    retry,
    /** True while the first page of the current query has not arrived yet. */
    loadingFirst: pending === 0,
    /** True while results from a previous query are still shown. */
    stale: queryChanged,
  };
}
