import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiClientError } from '../../api/client';
import {
  decideContentRevision,
  getContentRevisionQueue,
  getContentRevisionReview,
  type ContentDecision,
  type ContentQueueRow,
  type ContentState,
  type RevisionState,
} from '../../api/eventContent';
import type { Page } from '../../api/concerts';
import { WorkspaceSelect } from '../../components/WorkspaceSelect';
import { useToast } from '../../components/feedback/toast-context';
import { dateFormatter } from '../../data/formatters';
import { describeClassification } from '../../features/discovery/classification';
import {
  ageRatingLabelKey,
  contentDifferences,
  revisionLabelKey,
  type ContentDifference,
} from '../../features/event/eventContent';
import { DirectoryPagination } from '../operations/ConcertDirectoryPage';
import './ContentChangesQueue.css';

// The submission time is an instant: show it in the reviewer's own zone and name that zone.
const formatDate = dateFormatter({
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
});
const states: RevisionState[] = ['SUBMITTED', 'CHANGES_REQUESTED', 'REJECTED', 'APPROVED'];

function fieldLabelKey(field: ContentDifference['field']) {
  switch (field) {
    case 'title':
      return 'event-content:diffTitle';
    case 'description':
      return 'event-content:diffDescription';
    case 'translationVi':
      return 'event-content:diffTranslationVi';
    case 'translationEn':
      return 'event-content:diffTranslationEn';
    case 'artistBio':
      return 'event-content:artistBio';
    case 'ageRating':
      return 'event-content:ageRating';
    case 'refundPolicy':
      return 'event-content:refundPolicy';
    case 'classification':
      return 'event-content:diffClassification';
    case 'poster':
      return 'event-content:posterTitle';
  }
}

/** The Content changes tab of the release queue: submitted event content revisions and their decisions. */
export function ContentChangesQueue() {
  const { t } = useTranslation();
  const [parameters, setParameters] = useSearchParams();
  const state = states.find((value) => value === parameters.get('state')) ?? 'SUBMITTED';
  const page = Math.max(0, Math.min(1_000_000, parseInt(parameters.get('page') ?? '', 10) || 0));
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([state, page, retry]);
  const [result, setResult] = useState<{
    key: string;
    data?: Page<ContentQueueRow>;
    error?: string;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    getContentRevisionQueue(state, page, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, data });
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setResult({ key, error: failure instanceof Error ? failure.message : '' });
      });
    return () => controller.abort();
  }, [state, page, key]);

  function changeState(value: string) {
    const next = new URLSearchParams(parameters);
    next.set('tab', 'content');
    next.set('state', value);
    next.delete('page');
    setParameters(next);
  }

  const loaded = result?.key === key ? result : undefined;
  const listing = loaded?.data;
  return (
    <>
      <div className="concert-directory-filters">
        <label className="admin-field">
          {t('shared:releaseState')}
          <WorkspaceSelect
            label={t('shared:releaseState')}
            value={state}
            onChange={changeState}
            options={states.map((value) => ({ value, label: t(revisionLabelKey(value)) }))}
          />
        </label>
      </div>
      {!loaded && <p role="status">{t('performances:loading')}</p>}
      {loaded && !listing && (
        <p role="alert">
          {loaded.error || t('requestFailed')}{' '}
          <button
            type="button"
            className="admin-secondary-action"
            onClick={() => setRetry((value) => value + 1)}
          >
            {t('performances:refresh')}
          </button>
        </p>
      )}
      {listing && !listing.content.length && <p role="status">{t('event-content:queueEmpty')}</p>}
      {listing && listing.content.length > 0 && (
        <ul className="organization-list">
          {listing.content.map((row) => (
            <li key={row.eventId}>
              <ContentChangeItem row={row} onChange={() => setRetry((value) => value + 1)} />
            </li>
          ))}
        </ul>
      )}
      {listing && (
        <DirectoryPagination path="/admin/event-review" parameters={parameters} page={listing} />
      )}
    </>
  );
}

function ContentChangeItem({ row, onChange }: { row: ContentQueueRow; onChange: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<ContentState>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!open || detail) return;
    const controller = new AbortController();
    getContentRevisionReview(row.eventId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setDetail(data);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : t('requestFailed'));
      });
    return () => controller.abort();
  }, [open, detail, row.eventId, retry, t]);

  return (
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <strong>{row.title}</strong> · {t(revisionLabelKey(row.state))}
        {row.submittedAt ? ' · ' + formatDate.format(new Date(row.submittedAt)) : ''}
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
          {detail && detail.revision && (
            <ContentComparison
              state={detail}
              onChange={onChange}
              onStale={() => {
                // Someone else decided or the organizer changed the revision: show what it is now.
                setStale(true);
                setDetail(undefined);
                setRetry((value) => value + 1);
              }}
            />
          )}
          {stale && detail && <p role="alert">{t('event-content:decisionStale')}</p>}
        </>
      )}
    </details>
  );
}

function ContentComparison({
  state,
  onChange,
  onStale,
}: {
  state: ContentState;
  onChange: () => void;
  onStale: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const revision = state.revision!;
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const differences = contentDifferences(state.event, revision, (value) =>
    describeClassification(value, t),
  );

  async function decide(action: ContentDecision) {
    setBusy(true);
    setError('');
    try {
      const updated = await decideContentRevision(
        state.event.id,
        action,
        revision.revision,
        reason,
      );
      toast.success(
        t('event-content:decisionSaved', {
          state: updated.revision ? t(revisionLabelKey(updated.revision.state)) : '',
        }),
      );
      setReason('');
      onChange();
    } catch (failure) {
      if (failure instanceof ApiClientError && failure.status === 409) onStale();
      else setError(failure instanceof Error ? failure.message : t('requestFailed'));
    } finally {
      setBusy(false);
    }
  }

  const display = (entry: ContentDifference, value: string) => {
    if (entry.field === 'poster')
      return value ? <img className="content-diff-poster" src={value} alt="" /> : '—';
    if (entry.field === 'ageRating')
      return value ? t(ageRatingLabelKey(value as Parameters<typeof ageRatingLabelKey>[0])) : '—';
    return value || '—';
  };

  return (
    <>
      <div
        className="admin-table-wrap"
        role="region"
        aria-label={t('event-content:diffTitleRegion')}
        tabIndex={0}
      >
        <table className="admin-table content-diff">
          <thead>
            <tr>
              <th scope="col">{t('event-content:diffField')}</th>
              <th scope="col">{t('event-content:liveVersion')}</th>
              <th scope="col">{t('event-content:proposedVersion')}</th>
            </tr>
          </thead>
          <tbody>
            {differences.map((entry) => (
              <tr key={entry.field} data-changed={entry.changed || undefined}>
                <th scope="row">
                  {t(fieldLabelKey(entry.field))}
                  {entry.changed && (
                    <span className="event-status-badge">{t('event-content:diffChanged')}</span>
                  )}
                </th>
                <td className="content-diff-text">{display(entry, entry.current)}</td>
                <td className="content-diff-text">{display(entry, entry.proposed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        <Link
          className="admin-secondary-action"
          to={'/admin/events/' + encodeURIComponent(state.event.id)}
        >
          {t('event-content:openEvent')}
        </Link>
      </p>
      {revision.reason && <p>{revision.reason}</p>}
      {error && <p role="alert">{error}</p>}
      {revision.state === 'SUBMITTED' && (
        <div className="organization-form">
          <label className="admin-field">
            {t('shared:releaseReason')}
            <textarea
              value={reason}
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="admin-primary-action"
            disabled={busy}
            onClick={() => void decide('APPROVE')}
          >
            {t('event-content:approveContent')}
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
        </div>
      )}
    </>
  );
}
