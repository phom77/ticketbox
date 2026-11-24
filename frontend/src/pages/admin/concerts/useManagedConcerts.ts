import { useCallback, useEffect, useState } from 'react';
import {
  getAdminCheckinSummary,
  getAdminConcerts,
  type CheckinSummary,
  type ManagementApiScope,
} from '../../../api/admin';
import type { ConcertDetail, ConcertStatus, Page } from '../../../api/concerts';
import { isRequestCanceled } from '../../../api/client';
import { translate } from '../../../i18n';

/** One page of managed concerts with search and status filters; admins also get check-in totals. */
export function useManagedConcerts(apiScope: ManagementApiScope) {
  const [pageData, setPageData] = useState<Page<ConcertDetail> | null>(null);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<'' | ConcertStatus>('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [checkinSummaries, setCheckinSummaries] = useState<Record<string, CheckinSummary>>({});

  const loadConcerts = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError('');
      try {
        setPageData(await getAdminConcerts(page, 10, status || undefined, signal, apiScope, query));
      } catch (requestError) {
        if (!isRequestCanceled(requestError)) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : translate('admin:adminConcertsPage_khongTheTaiDanhSachConcert'),
          );
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [apiScope, page, query, status],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadConcerts(controller.signal);
    return () => controller.abort();
  }, [loadConcerts]);

  useEffect(() => {
    if (apiScope !== 'admin' || !pageData?.content.length) {
      setCheckinSummaries({});
      return;
    }

    const controller = new AbortController();
    Promise.allSettled(
      pageData.content.map((concert) => getAdminCheckinSummary(concert.id, controller.signal)),
    ).then((results) => {
      if (controller.signal.aborted) return;
      const next: Record<string, CheckinSummary> = {};
      results.forEach((result) => {
        if (result.status === 'fulfilled') next[result.value.concertId] = result.value;
      });
      setCheckinSummaries(next);
    });

    return () => controller.abort();
  }, [apiScope, pageData?.content]);

  return {
    pageData,
    page,
    setPage,
    status,
    setStatus,
    query,
    setQuery,
    loading,
    error,
    checkinSummaries,
    loadConcerts,
  };
}
