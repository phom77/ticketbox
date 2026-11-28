import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { ConcertDetail } from '../../api/concerts';
import { BatchDetailDialog } from '../admin/guest-imports/BatchDetailDialog';
import { BatchHistory } from '../admin/guest-imports/BatchHistory';
import { GuestUploadPanel } from '../admin/guest-imports/GuestUploadPanel';
import { useBatchLogs } from '../admin/guest-imports/useBatchLogs';
import { useBatchTracking } from '../admin/guest-imports/useBatchTracking';
import { useGuestCsvUpload } from '../admin/guest-imports/useGuestCsvUpload';

/**
 * Guest lists of one performance. Check-in keys guests by the performance id for native performances, so
 * the existing import screens work with that id. Before the first release there is nothing to import into.
 */
export function PerformanceGuests({
  performanceId,
  label,
  released,
  reviewPath,
}: {
  performanceId: string;
  label: string;
  released: boolean;
  reviewPath?: string;
}) {
  const { t } = useTranslation();
  if (!released)
    return (
      <section className="performance-panel performance-flow-panel" aria-labelledby="guests-locked">
        <h3 id="guests-locked">{t('event-content:guestsLockedTitle')}</h3>
        <p className="performance-flow-help">{t('event-content:guestsLockedBody')}</p>
        {reviewPath && (
          <Link className="button button-secondary" to={reviewPath}>
            {t('event-content:guestsLockedAction')}
          </Link>
        )}
      </section>
    );
  return <GuestImports performanceId={performanceId} label={label} />;
}

function GuestImports({ performanceId, label }: { performanceId: string; label: string }) {
  const history = useBatchLogs('organizer');
  const { concertFilter, loadLogs, updateFilters } = history;
  const tracking = useBatchTracking({ apiScope: 'organizer', loadLogs });
  const upload = useGuestCsvUpload({
    apiScope: 'organizer',
    uploadMode: 'scheduled',
    showUploaded: tracking.showUploaded,
    refreshLogs: () => loadLogs(undefined, true),
  });
  // The import screens list concerts; here the only choice is this performance.
  const concerts = useMemo(
    () => [{ id: performanceId, title: label } as ConcertDetail],
    [performanceId, label],
  );
  const names = useMemo(() => new Map([[performanceId, label]]), [performanceId, label]);
  useEffect(() => {
    if (concertFilter !== performanceId) updateFilters({ concertId: performanceId });
  }, [concertFilter, performanceId, updateFilters]);
  const scoped = {
    ...history,
    clearFilters: () => updateFilters({ status: '', source: '' }),
  };
  const { selectedLog } = tracking;

  return (
    <>
      <GuestUploadPanel
        concerts={concerts}
        loadingConcerts={false}
        uploadConcertId={performanceId}
        setUploadConcertId={() => undefined}
        uploadMode="scheduled"
        upload={upload}
        latestBatch={tracking.latestBatch}
        concertNames={names}
        openDetail={(log) => void tracking.openDetail(log)}
      />
      <BatchHistory
        concerts={concerts}
        concertNames={names}
        history={scoped}
        openDetail={(log) => void tracking.openDetail(log)}
      />
      {selectedLog ? (
        <BatchDetailDialog
          log={selectedLog}
          guests={tracking.selectedLogGuests}
          concertName={label}
          loading={tracking.detailLoading}
          showTechnicalDetails={false}
          onClose={tracking.closeDetail}
        />
      ) : null}
    </>
  );
}
