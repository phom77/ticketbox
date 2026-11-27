import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getBatchLogs,
  type BatchLog,
  type BatchLogSource,
  type BatchLogStatus,
  type ManagementApiScope,
} from '../../../api/admin';
import type { Page } from '../../../api/concerts';
import { ApiClientError, isRequestCanceled } from '../../../api/client';
import { translate } from '../../../i18n';
import { isActiveBatch, sources, statuses } from './batchLabels';

/**
 * Batch history filtered by the address bar. Refreshes every 5 seconds while a listed batch is
 * still pending or running and the page is visible.
 */
export function useBatchLogs(apiScope: ManagementApiScope) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [logs, setLogs] = useState<Page<BatchLog> | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [logsError, setLogsError] = useState('');
  // Check-in has no record of a concert before its release; that is not a failure.
  const [logsNotFound, setLogsNotFound] = useState(false);

  const page = Math.max(0, Math.floor(Number(searchParams.get('page')) || 0));
  const concertFilter = searchParams.get('concertId') ?? '';
  const statusValue = searchParams.get('status') ?? '';
  const sourceValue = searchParams.get('source') ?? '';
  const statusFilter = statuses.some((item) => item.value === statusValue)
    ? (statusValue as '' | BatchLogStatus)
    : '';
  const sourceFilter = sources.some((item) => item.value === sourceValue)
    ? (sourceValue as '' | BatchLogSource)
    : '';

  const loadLogs = useCallback(
    async (signal?: AbortSignal, silent = false) => {
      if (!silent) setLoadingLogs(true);
      setLogsError('');
      setLogsNotFound(false);
      try {
        setLogs(
          await getBatchLogs(
            {
              page,
              size: 20,
              concertId: concertFilter || undefined,
              status: statusFilter || undefined,
              source: sourceFilter || undefined,
            },
            signal,
            apiScope,
          ),
        );
      } catch (requestError) {
        if (requestError instanceof ApiClientError && requestError.status === 404) {
          setLogs(null);
          setLogsNotFound(true);
        } else if (!isRequestCanceled(requestError)) {
          setLogsError(
            requestError instanceof Error
              ? requestError.message
              : translate('admin:adminGuestImportsPage_khongTheTaiLichSuImport'),
          );
        }
      } finally {
        if (!signal?.aborted && !silent) setLoadingLogs(false);
      }
    },
    [apiScope, concertFilter, page, sourceFilter, statusFilter],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadLogs(controller.signal);
    return () => controller.abort();
  }, [loadLogs]);

  const hasRunningLog = logs?.content.some((log) => isActiveBatch(log.status)) ?? false;
  useEffect(() => {
    if (!hasRunningLog) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadLogs(undefined, true);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [hasRunningLog, loadLogs]);

  function updateFilters(values: Record<string, string>) {
    const next = new URLSearchParams(searchParams);
    Object.entries(values).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    if (!('page' in values)) next.delete('page');
    setSearchParams(next, { replace: true });
  }

  function clearFilters() {
    setSearchParams({}, { replace: true });
  }

  return {
    logs,
    loadingLogs,
    logsError,
    logsNotFound,
    page,
    concertFilter,
    statusFilter,
    sourceFilter,
    loadLogs,
    updateFilters,
    clearFilters,
  };
}
