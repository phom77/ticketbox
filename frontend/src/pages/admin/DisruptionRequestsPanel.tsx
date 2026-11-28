import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  declineDisruptionRequest,
  listDisruptionRequests,
  type QueuedRequest,
} from '../../api/performanceScheduling';
import { useToast } from '../../components/feedback/toast-context';
import { formatLanguage } from '../../i18n';
import { formatPerformanceDateTime } from '../organizer/performanceDateTime';

/** Platform queue of organizer cancel and postpone requests. Accepting opens the disruption workflow. */
export function DisruptionRequestsPanel() {
  const { t } = useTranslation('scheduling');
  const toast = useToast();
  const locale = formatLanguage();
  const [items, setItems] = useState<QueuedRequest[] | null>(null);
  const [error, setError] = useState('');
  const [declining, setDeclining] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback((signal?: AbortSignal) => {
    listDisruptionRequests('REQUESTED', signal)
      .then((result) => {
        setItems(result);
        setError('');
      })
      .catch((failure) => {
        if (!signal?.aborted) setError(failure instanceof Error ? failure.message : '');
      });
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function decline(event: FormEvent, id: string) {
    event.preventDefault();
    setBusy(true);
    try {
      await declineDisruptionRequest(id, reason);
      toast.success(t('scheduling:declined'));
      setDeclining(null);
      setReason('');
      load();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : t('scheduling:saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="performance-ops-panel" aria-label={t('scheduling:requestsTab')}>
      <p className="performance-ops-muted">{t('scheduling:requestsHelp')}</p>
      {error && <p role="alert">{error}</p>}
      {!items && !error && <p role="status">{t('scheduling:loading')}</p>}
      {items?.length === 0 && <p role="status">{t('scheduling:requestsEmpty')}</p>}
      <ul className="scheduling-list">
        {items?.map(({ request, title, venueName, startsAt, timezone }) => (
          <li key={request.id}>
            <strong>{title}</strong>
            <span>
              {formatPerformanceDateTime(startsAt, timezone, locale)}
              {venueName ? ` · ${venueName}` : ''}
            </span>
            <span>
              {t(`request_${request.kind}`)} ·{' '}
              {t('scheduling:requestedAt', {
                when: formatPerformanceDateTime(request.requestedAt, timezone, locale),
              })}
            </span>
            <span>{request.reason}</span>
            {request.proposedStartsAt && (
              <span>
                {t('scheduling:proposedStart', {
                  when: formatPerformanceDateTime(request.proposedStartsAt, timezone, locale),
                })}
              </span>
            )}
            <div className="performance-ops-form-actions">
              <Link
                className="button button-primary"
                to={`/admin/performance-operations?performance=${request.performanceId}&request=${request.id}`}
              >
                {t('scheduling:openRequest')}
              </Link>
              <button
                type="button"
                className="button button-secondary"
                aria-expanded={declining === request.id}
                onClick={() => setDeclining(declining === request.id ? null : request.id)}
              >
                {t('scheduling:declineRequest')}
              </button>
            </div>
            {declining === request.id && (
              <form
                className="scheduling-form"
                onSubmit={(event) => void decline(event, request.id)}
              >
                <label>
                  {t('scheduling:declineReason')}
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    required
                  />
                </label>
                <button className="button button-secondary" disabled={busy || !reason.trim()}>
                  {t('scheduling:declineConfirm')}
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
