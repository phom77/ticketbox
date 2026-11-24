import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getAdminConcerts, type ManagementApiScope } from '../../api/admin';
import type { ConcertDetail } from '../../api/concerts';
import { isRequestCanceled } from '../../api/client';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { useToast } from '../../components/feedback/toast-context';
import { BatchDetailDialog } from './guest-imports/BatchDetailDialog';
import { BatchHistory } from './guest-imports/BatchHistory';
import { GuestUploadPanel } from './guest-imports/GuestUploadPanel';
import { useBatchLogs } from './guest-imports/useBatchLogs';
import { useBatchTracking } from './guest-imports/useBatchTracking';
import { useGuestCsvUpload } from './guest-imports/useGuestCsvUpload';

/**
 * Guest-list CSV imports: upload a file for a concert, follow its batch, and browse the history.
 * The pieces live in ./guest-imports.
 */
export function AdminGuestImportsPage({
  apiScope = 'admin',
  uploadMode = 'immediate',
}: {
  apiScope?: ManagementApiScope;
  uploadMode?: 'immediate' | 'scheduled';
}) {
  useTranslation();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const root = apiScope === 'admin' ? '/admin' : '/organizer';
  const returnTo = searchParams.get('returnTo');
  const safeReturnTo = returnTo?.startsWith(`${root}/concerts/`) ? returnTo : '';
  const [concerts, setConcerts] = useState<ConcertDetail[]>([]);
  const [loadingConcerts, setLoadingConcerts] = useState(true);
  const [uploadConcertId, setUploadConcertId] = useState('');

  const history = useBatchLogs(apiScope);
  const { concertFilter, loadLogs } = history;
  const tracking = useBatchTracking({ apiScope, loadLogs });
  const upload = useGuestCsvUpload({
    apiScope,
    uploadMode,
    showUploaded: tracking.showUploaded,
    refreshLogs: () => loadLogs(undefined, true),
  });

  useEffect(() => {
    const controller = new AbortController();
    async function loadConcerts() {
      setLoadingConcerts(true);
      try {
        const data = await getAdminConcerts(0, 100, undefined, controller.signal, apiScope);
        setConcerts(data.content);
        setUploadConcertId((current) => current || concertFilter || data.content[0]?.id || '');
      } catch (requestError) {
        if (!isRequestCanceled(requestError)) {
          toast.error(
            requestError instanceof Error
              ? requestError.message
              : translate('admin:adminGuestImportsPage_khongTheTaiDanhSachConcert'),
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoadingConcerts(false);
      }
    }
    void loadConcerts();
    return () => controller.abort();
  }, [apiScope, concertFilter, toast]);

  const concertNames = useMemo(
    () => new Map(concerts.map((concert) => [concert.id, concert.title])),
    [concerts],
  );
  const openDetail = (log: Parameters<typeof tracking.openDetail>[0]) =>
    void tracking.openDetail(log);
  const { latestBatch, selectedLog } = tracking;

  return (
    <>
      <AdminPageHeader
        title={translate('admin:adminGuestImportsPage_importKhachMoi')}
        actions={
          safeReturnTo ? (
            <Link className="admin-secondary-action" to={safeReturnTo}>
              {translate('admin:adminGuestImportsPage_quayVeConcert')}
            </Link>
          ) : undefined
        }
      />

      <GuestUploadPanel
        concerts={concerts}
        loadingConcerts={loadingConcerts}
        uploadConcertId={uploadConcertId}
        setUploadConcertId={setUploadConcertId}
        uploadMode={uploadMode}
        upload={upload}
        latestBatch={latestBatch}
        concertNames={concertNames}
        openDetail={openDetail}
      />

      <BatchHistory
        concerts={concerts}
        concertNames={concertNames}
        history={history}
        openDetail={openDetail}
      />

      {selectedLog ? (
        <BatchDetailDialog
          log={selectedLog}
          guests={tracking.selectedLogGuests}
          concertName={concertNames.get(selectedLog.concertId ?? '')}
          loading={tracking.detailLoading}
          showTechnicalDetails={apiScope === 'admin'}
          onClose={tracking.closeDetail}
        />
      ) : null}
    </>
  );
}
