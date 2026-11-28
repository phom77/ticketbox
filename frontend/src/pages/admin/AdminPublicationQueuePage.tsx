import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import {
  getOperationsPerformanceReview,
  getOperationsReviews,
  type OperationsPage,
  type OperationsReviewRow,
} from '../../api/operations';
import { decidePerformanceReview, type PerformanceReview } from '../../api/performanceManagement';
import type { ReviewDecision } from '../../api/publication';
import { WorkspaceSelect } from '../../components/WorkspaceSelect';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { useToast } from '../../components/feedback/toast-context';
import { dateFormatter, numberFormatter } from '../../data/formatters';
import { DirectoryPagination } from '../operations/ConcertDirectoryPage';
import { ContentChangesQueue } from './ContentChangesQueue';

const path = '/admin/event-review';
const formatDate = dateFormatter({
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});
const money = numberFormatter({ style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

/** Performance releases and, in a second tab, reviewed changes to the content of released events. */
export function AdminPublicationQueuePage() {
  const { t } = useTranslation();
  const [parameters] = useSearchParams();
  const content = parameters.get('tab') === 'content';
  return (
    <>
      <nav className="concert-workspace-tabs" aria-label={t('event-content:queueTabs')}>
        <Link
          className={content ? undefined : 'active'}
          aria-current={content ? undefined : 'page'}
          to={path}
        >
          {t('event-content:tabReleases')}
        </Link>
        <Link
          className={content ? 'active' : undefined}
          aria-current={content ? 'page' : undefined}
          to={path + '?tab=content'}
        >
          {t('event-content:tabContent')}
        </Link>
      </nav>
      {content ? (
        <>
          <AdminPageHeader title={t('event-content:contentQueueTitle')} />
          <ContentChangesQueue />
        </>
      ) : (
        <ReleaseQueue />
      )}
    </>
  );
}

function ReleaseQueue() {
  const { t } = useTranslation();
  const [parameters, setParameters] = useSearchParams();
  const [retry, setRetry] = useState(0);
  const query = parameters.get('q') ?? '';
  const status = parameters.get('state') ?? 'ALL';
  const eventId = parameters.get('eventId') ?? undefined;
  const performanceId = parameters.get('performanceId') ?? undefined;
  const concertId = parameters.get('concertId') ?? undefined;
  const organizationId = parameters.get('organizationId') ?? undefined;
  const page = Math.max(0, Math.min(1_000_000, parseInt(parameters.get('page') ?? '', 10) || 0));
  const searchKey = JSON.stringify([
    query,
    status,
    eventId,
    performanceId,
    concertId,
    organizationId,
    page,
    retry,
  ]);
  const [result, setResult] = useState<{
    key: string;
    data?: OperationsPage<OperationsReviewRow>;
    error?: string;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    void getOperationsReviews(
      { query, status, eventId, performanceId, concertId, organizationId, page },
      controller.signal,
    )
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key: searchKey, data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setResult({ key: searchKey, error: error instanceof Error ? error.message : '' });
      });
    return () => controller.abort();
  }, [query, status, eventId, performanceId, concertId, organizationId, page, searchKey]);

  function changeFilter(key: string, value: string) {
    const next = new URLSearchParams(parameters);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setParameters(next);
  }

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    changeFilter('q', String(new FormData(event.currentTarget).get('q') ?? '').trim());
  }

  const loaded = result?.key === searchKey ? result : undefined;
  const listing = loaded?.data;
  return (
    <>
      <AdminPageHeader
        title={t('shared:releaseQueue')}
        actions={
          <button
            className="admin-secondary-action"
            type="button"
            disabled={!loaded}
            onClick={() => setRetry((value) => value + 1)}
          >
            {t('shared:publicationPanel_kiemTraLai')}
          </button>
        }
      />
      <div className="concert-directory-filters">
        <form key={query} onSubmit={applySearch}>
          <label className="admin-field">
            {t('shared:releaseEvent')}
            <input type="search" name="q" defaultValue={query} maxLength={160} />
          </label>
          <button className="admin-secondary-action" type="submit">
            {t('concert-directory:apply')}
          </button>
        </form>
        <label className="admin-field">
          {t('shared:releaseState')}
          <WorkspaceSelect
            label={t('shared:releaseState')}
            value={status}
            onChange={(value) => changeFilter('state', value)}
            options={[
              { value: 'ALL', label: t('shared:releaseAllStates') },
              ...[
                'SUBMITTED',
                'SCHEDULED',
                'CHANGES_REQUESTED',
                'REJECTED',
                'HELD',
                'RELEASED',
                'MISSED',
              ].map((value) => ({ value, label: t(`shared:release_${value}`) })),
            ]}
          />
        </label>
        {parameters.size > 0 && (
          <Link className="admin-secondary-action" to={path}>
            {t('concert-directory:clearFilters')}
          </Link>
        )}
      </div>
      {!loaded && <p role="status">{t('shared:publicationPanel_dangKiemTraDieuKienMoBan')}</p>}
      {loaded && !listing && <p role="alert">{loaded.error || t('requestFailed')}</p>}
      {listing && !listing.content.length && <p role="status">{t('shared:releaseQueueEmpty')}</p>}
      {listing && listing.content.length > 0 && (
        <ul className="organization-list">
          {listing.content.map((row) => (
            <li key={row.id}>
              {row.model === 'LEGACY' && row.legacyConcertId ? (
                <>
                  <Link
                    className="admin-table-primary"
                    to={`/admin/concerts/${encodeURIComponent(row.legacyConcertId)}`}
                  >
                    {row.title}
                  </Link>
                  <p>
                    {t(`shared:release_${row.status}`)} ·{' '}
                    {row.publishAt ? `${formatDate.format(new Date(row.publishAt))} (ICT)` : '—'}
                  </p>
                </>
              ) : (
                <PerformanceReviewSummary
                  row={row}
                  initiallyOpen={row.performanceId === performanceId}
                  onChange={() => setRetry((value) => value + 1)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {listing && <DirectoryPagination path={path} parameters={parameters} page={listing} />}
    </>
  );
}

function PerformanceReviewSummary({
  row,
  initiallyOpen,
  onChange,
}: {
  row: OperationsReviewRow;
  initiallyOpen: boolean;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(initiallyOpen);
  const [detail, setDetail] = useState<PerformanceReview>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!open || detail) return;
    const controller = new AbortController();
    void getOperationsPerformanceReview(row.performanceId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setDetail(data);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : t('requestFailed'));
      });
    return () => controller.abort();
  }, [open, detail, row.performanceId, retry, t]);

  return (
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <strong>{row.title}</strong> · {t(`shared:release_${row.status}`)} ·{' '}
        {row.publishAt
          ? `${formatDate.format(new Date(row.publishAt))} (ICT)`
          : t('scheduling:releaseWhenApproved')}
      </summary>
      {open && (
        <>
          {error && (
            <p role="alert">
              {error}{' '}
              <button
                type="button"
                className="admin-secondary-action"
                onClick={() => {
                  setError('');
                  setRetry((value) => value + 1);
                }}
              >
                {t('performances:refresh')}
              </button>
            </p>
          )}
          {!detail && !error && <p role="status">{t('performances:loading')}</p>}
          {detail && <PerformanceReviewItem row={detail} onChange={onChange} />}
        </>
      )}
    </details>
  );
}

function PerformanceReviewItem({
  row,
  onChange,
}: {
  row: PerformanceReview;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const summary = row.summary;

  async function decide(action: ReviewDecision | 'HOLD') {
    setBusy(true);
    setError('');
    try {
      const updated = await decidePerformanceReview(row.performanceId, row.id, action, reason);
      toast.success(
        t('concert-directory:reviewSaved', { state: t(`shared:release_${updated.state}`) }),
      );
      onChange();
      setReason('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('requestFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p>{formatDate.format(new Date(summary.startsAt))}</p>
      <p>
        {summary.venueName} · {summary.spaceName} ·{' '}
        {t(summary.publicVisible ? 'performances:reviewPublic' : 'performances:reviewPrivate')}
      </p>
      {summary.description && <p>{summary.description}</p>}
      <dl className="publication-status">
        <div>
          <dt>{t('shared:releasePublishAt')} (ICT)</dt>
          <dd>
            {row.publishAt
              ? formatDate.format(new Date(row.publishAt))
              : t('scheduling:releaseWhenApproved')}
          </dd>
        </div>
        <div>
          <dt>{t('shared:releaseSaleAt')} (ICT)</dt>
          <dd>{formatDate.format(new Date(summary.saleStartAt))}</dd>
        </div>
      </dl>
      <ul>
        {summary.offers
          .filter((offer) => offer.active)
          .map((offer, index) => (
            <li key={index}>
              {offer.name} · {money.format(offer.price)} ·{' '}
              {formatDate.format(new Date(offer.saleStartAt))} →{' '}
              {formatDate.format(new Date(offer.saleEndAt))}
            </li>
          ))}
      </ul>
      {row.reason && <p>{row.reason}</p>}
      {error && <p role="alert">{error}</p>}
      {(row.state === 'SUBMITTED' || row.state === 'SCHEDULED') && (
        <div className="organization-form">
          <label className="admin-field">
            {t('shared:releaseReason')}
            <textarea
              value={reason}
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          {row.state === 'SUBMITTED' ? (
            <>
              <button
                type="button"
                className="admin-primary-action"
                disabled={busy}
                onClick={() => void decide('APPROVE')}
              >
                {t('shared:releaseApprove')}
              </button>
              <button
                type="button"
                className="admin-secondary-action"
                disabled={busy || !reason.trim()}
                onClick={() => void decide('REQUEST_CHANGES')}
              >
                {t('shared:releaseRequestChanges')}
              </button>
              <button
                type="button"
                className="admin-secondary-action"
                disabled={busy || !reason.trim()}
                onClick={() => void decide('REJECT')}
              >
                {t('shared:releaseReject')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="admin-secondary-action"
              disabled={busy || !reason.trim()}
              onClick={() => void decide('HOLD')}
            >
              {t('shared:releaseHold')}
            </button>
          )}
        </div>
      )}
    </>
  );
}
