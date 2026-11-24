import { useEffect, useRef, useState } from 'react';
import {
  getBatchLog,
  getConcertGuestList,
  type BatchLog,
  type GuestListEntry,
  type ManagementApiScope,
} from '../../../api/admin';
import { isRequestCanceled } from '../../../api/client';
import { useToast } from '../../../components/feedback/toast-context';
import { translate } from '../../../i18n';
import { isActiveBatch } from './batchLabels';

/**
 * The latest uploaded batch and the batch open in the detail dialog. While either is pending or
 * running it is polled every 3 seconds; when it finishes, the history refreshes and the dialog
 * loads the concert's guests.
 */
export function useBatchTracking({
  apiScope,
  loadLogs,
}: {
  apiScope: ManagementApiScope;
  loadLogs: (signal?: AbortSignal, silent?: boolean) => Promise<void>;
}) {
  const toast = useToast();
  const [latestBatch, setLatestBatch] = useState<BatchLog | null>(null);
  const [selectedLog, setSelectedLog] = useState<BatchLog | null>(null);
  const [selectedLogGuests, setSelectedLogGuests] = useState<GuestListEntry[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const selectedLogIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedLogIdRef.current = selectedLog?.id ?? null;
  }, [selectedLog?.id]);

  useEffect(() => {
    if (!selectedLog || !isActiveBatch(selectedLog.status)) return;
    const controller = new AbortController();
    let requestInFlight = false;
    const timer = window.setInterval(async () => {
      if (requestInFlight) return;
      if (document.visibilityState !== 'visible') return;
      requestInFlight = true;
      try {
        const updated = await getBatchLog(selectedLog.id, controller.signal, apiScope);
        setSelectedLog(updated);
        setLatestBatch((current) => (current?.id === updated.id ? updated : current));
        if (!isActiveBatch(updated.status)) {
          void loadLogs(undefined, true);
          if (updated.concertId) {
            setDetailLoading(true);
            void getConcertGuestList(updated.concertId, 0, 100, undefined, apiScope)
              .then((guestPage) => {
                if (selectedLogIdRef.current === updated.id) {
                  setSelectedLogGuests(guestPage.content);
                }
              })
              .catch((requestError) => {
                if (!isRequestCanceled(requestError)) {
                  toast.error(
                    requestError instanceof Error
                      ? requestError.message
                      : translate('admin:adminGuestImportsPage_guestListUpdateFailed'),
                  );
                }
              })
              .finally(() => {
                if (selectedLogIdRef.current === updated.id) setDetailLoading(false);
              });
          }
        }
      } catch (requestError) {
        if (!isRequestCanceled(requestError)) {
          toast.error(
            requestError instanceof Error
              ? requestError.message
              : translate('admin:adminGuestImportsPage_khongTheCapNhatTrangThaiImport'),
          );
        }
      } finally {
        requestInFlight = false;
      }
    }, 3000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [apiScope, loadLogs, selectedLog, toast]);

  useEffect(() => {
    if (!latestBatch || !isActiveBatch(latestBatch.status) || selectedLog?.id === latestBatch.id)
      return;
    const controller = new AbortController();
    let requestInFlight = false;
    const timer = window.setInterval(async () => {
      if (requestInFlight || document.visibilityState !== 'visible') return;
      requestInFlight = true;
      try {
        const updated = await getBatchLog(latestBatch.id, controller.signal, apiScope);
        setLatestBatch(updated);
        if (!isActiveBatch(updated.status)) void loadLogs(undefined, true);
      } catch (requestError) {
        if (!isRequestCanceled(requestError)) {
          toast.error(
            requestError instanceof Error
              ? requestError.message
              : translate('admin:adminGuestImportsPage_khongTheCapNhatBatchGanNhat'),
          );
        }
      } finally {
        requestInFlight = false;
      }
    }, 3000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [apiScope, latestBatch, loadLogs, selectedLog?.id, toast]);

  /** Shows a just-uploaded batch as the latest one and opens it. */
  async function showUploaded(batchLogId: string) {
    try {
      const detail = await getBatchLog(batchLogId, undefined, apiScope);
      setLatestBatch(detail);
      setSelectedLogGuests([]);
      selectedLogIdRef.current = detail.id;
      setSelectedLog(detail);
      if (!isActiveBatch(detail.status) && detail.concertId) {
        setDetailLoading(true);
        void getConcertGuestList(detail.concertId, 0, 100, undefined, apiScope)
          .then((guestPage) => {
            if (selectedLogIdRef.current === detail.id) {
              setSelectedLogGuests(guestPage.content);
            }
          })
          .catch((requestError) => {
            if (!isRequestCanceled(requestError)) {
              toast.error(
                requestError instanceof Error
                  ? requestError.message
                  : translate('admin:adminGuestImportsPage_guestListLoadFailed'),
              );
            }
          })
          .finally(() => {
            if (selectedLogIdRef.current === detail.id) setDetailLoading(false);
          });
      }
    } catch (detailError) {
      toast.error(
        detailError instanceof Error
          ? translate('admin:adminGuestImportsPage_fileDaDuocTiepNhanNhungChua', {
              arg1: detailError.message,
            })
          : translate('admin:adminGuestImportsPage_fileDaDuocTiepNhanNhungChua_2'),
      );
    }
  }

  async function openDetail(log: BatchLog) {
    setSelectedLog(log);
    setDetailLoading(true);
    setSelectedLogGuests([]);
    try {
      const [detail, guestPage] = await Promise.all([
        getBatchLog(log.id, undefined, apiScope),
        log.concertId
          ? getConcertGuestList(log.concertId, 0, 100, undefined, apiScope)
          : Promise.resolve(null),
      ]);
      setSelectedLog(detail);
      setSelectedLogGuests(guestPage?.content ?? []);
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : translate('admin:adminGuestImportsPage_khongTheTaiChiTietBatch'),
      );
    } finally {
      setDetailLoading(false);
    }
  }

  return {
    latestBatch,
    selectedLog,
    selectedLogGuests,
    detailLoading,
    showUploaded,
    openDetail,
    closeDetail: () => setSelectedLog(null),
  };
}
