import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Pause, Play } from 'lucide-react';
import { DateTimePicker } from '../../../components/date/DateTimePicker';
import { useToast } from '../../../components/feedback/toast-context';
import {
  getSalesState,
  pauseSales,
  requestDisruption,
  resumeSales,
  withdrawDisruptionRequest,
  type SalesState,
} from '../../../api/performanceScheduling';
import type { ManagedPerformance } from '../../../api/performanceManagement';
import { formatPerformanceDateTime, resolvePerformanceDateTime } from '../performanceDateTime';
import { SchedulingDialog } from './SchedulingDialog';
import { AdminConfirmDialog } from '../../../components/admin/AdminConfirmDialog';
import { formatLanguage } from '../../../i18n';

/** Sales controls of a released performance: pause and resume, and cancel or postpone requests. */
export function PerformanceSalesPanel({ performance }: { performance: ManagedPerformance }) {
  const { t } = useTranslation('scheduling');
  const toast = useToast();
  const [state, setState] = useState<SalesState | null>(null);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<'pause' | 'resume' | 'request' | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [actionId, setActionId] = useState(() => crypto.randomUUID());

  const load = useCallback(
    (signal?: AbortSignal) =>
      getSalesState(performance.id, signal)
        .then((result) => {
          setState(result);
          setError('');
        })
        .catch((failure) => {
          if (!signal?.aborted)
            setError(failure instanceof Error ? failure.message : t('scheduling:loadFailed'));
        }),
    [performance.id, t],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // Pausing and resuming show a pending state until Ticketing acknowledges the version.
  const pending = state?.pause?.state === 'PAUSING' || state?.pause?.state === 'RESUMING';
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(timer);
  }, [pending, load]);

  const live = state && ['ON_SALE', 'SOLD_OUT'].includes(state.status);
  const organizerPause =
    state?.pause && !['RESUMED', 'SUPERSEDED'].includes(state.pause.state) ? state.pause : null;
  const disruptionOpen = state?.disruption && state.disruption.state !== 'RESUMED';
  const request = state?.request;

  async function act(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      toast.success(done);
      setDialog(null);
      setReason('');
      setActionId(crypto.randomUUID());
      await load();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : t('scheduling:saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  if (error)
    return (
      <section className="performance-panel" aria-label={t('scheduling:salesTitle')}>
        <p role="alert">{error}</p>
      </section>
    );
  if (!state) return <p role="status">{t('scheduling:loading')}</p>;
  if (!live && !organizerPause && !disruptionOpen && !request) return null;

  const stateKey = disruptionOpen
    ? `disruption_${state.disruption?.state}`
    : organizerPause
      ? `pause_${organizerPause.state}`
      : state.salesSuspended
        ? 'pause_PAUSED'
        : 'salesOpen';
  return (
    <section className="performance-panel scheduling-panel" aria-label={t('scheduling:salesTitle')}>
      <h3>{t('scheduling:salesTitle')}</h3>
      <p>
        <span className="scheduling-status" role="status">
          {t(stateKey)}
        </span>
      </p>
      <div className="performance-options">
        {live && !state.salesSuspended && !disruptionOpen && (
          <button
            type="button"
            className="button button-secondary"
            disabled={busy || !state.ticketingAcknowledged}
            onClick={() => setDialog('pause')}
          >
            <Pause size={17} aria-hidden="true" />
            {t('scheduling:pauseSales')}
          </button>
        )}
        {organizerPause && organizerPause.state !== 'RESUMING' && !disruptionOpen && (
          <button
            type="button"
            className="button button-secondary"
            disabled={busy}
            onClick={() => setDialog('resume')}
          >
            <Play size={17} aria-hidden="true" />
            {t('scheduling:resumeSales')}
          </button>
        )}
        {live && !disruptionOpen && request?.state !== 'REQUESTED' && (
          <button
            type="button"
            className="button button-secondary"
            disabled={busy}
            onClick={() => setDialog('request')}
          >
            {t('scheduling:requestChange')}
          </button>
        )}
      </div>
      {organizerPause && (
        <p className="performance-field-help">
          {t('scheduling:pauseReason', { reason: organizerPause.reason })}
        </p>
      )}
      {request && (
        <RequestStatus
          request={request}
          performance={performance}
          busy={busy}
          onWithdraw={() =>
            void act(
              () => withdrawDisruptionRequest(performance.id, request.id),
              t('scheduling:requestWithdrawn'),
            )
          }
        />
      )}
      {dialog === 'pause' && (
        <SchedulingDialog
          title={t('scheduling:pauseTitle')}
          description={t('scheduling:pauseHelp')}
          onClose={() => setDialog(null)}
          busy={busy}
        >
          <form
            className="scheduling-form"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void act(
                () => pauseSales(performance.id, actionId, reason),
                t('scheduling:pauseSent'),
              );
            }}
          >
            <label>
              {t('scheduling:reasonLabel')}
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                required
                rows={3}
              />
            </label>
            <div className="performance-flow-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setDialog(null)}
              >
                {t('scheduling:cancel')}
              </button>
              <button className="button button-primary" disabled={busy || !reason.trim()}>
                {t('scheduling:pauseConfirm')}
              </button>
            </div>
          </form>
        </SchedulingDialog>
      )}
      {dialog === 'resume' && organizerPause && (
        <AdminConfirmDialog
          title={t('scheduling:resumeTitle')}
          description={t('scheduling:resumeHelp')}
          confirmLabel={t('scheduling:resumeConfirm')}
          cancelLabel={t('scheduling:cancel')}
          destructive={false}
          loading={busy}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            void act(
              () => resumeSales(performance.id, organizerPause.id),
              t('scheduling:resumeSent'),
            )
          }
        />
      )}
      {dialog === 'request' && (
        <RequestDialog
          performance={performance}
          busy={busy}
          canPause={!state.salesSuspended}
          onClose={() => setDialog(null)}
          onSend={(input) =>
            act(() => requestDisruption(performance.id, input), t('scheduling:requestSent'))
          }
        />
      )}
    </section>
  );
}

function RequestStatus({
  request,
  performance,
  busy,
  onWithdraw,
}: {
  request: NonNullable<SalesState['request']>;
  performance: ManagedPerformance;
  busy: boolean;
  onWithdraw: () => void;
}) {
  const { t } = useTranslation('scheduling');
  const locale = formatLanguage();
  return (
    <div className="scheduling-list">
      <p>
        <strong>{t(`request_${request.kind}`)}</strong> · {t(`requestState_${request.state}`)}
      </p>
      <p>{request.reason}</p>
      {request.proposedStartsAt && (
        <p>
          {t('scheduling:proposedStart', {
            when: formatPerformanceDateTime(request.proposedStartsAt, performance.timezone, locale),
          })}
        </p>
      )}
      {request.decisionReason && (
        <p>{t('scheduling:decisionReason', { reason: request.decisionReason })}</p>
      )}
      {request.state === 'REQUESTED' && (
        <div className="performance-flow-actions">
          <button
            type="button"
            className="button button-secondary"
            disabled={busy}
            onClick={onWithdraw}
          >
            {t('scheduling:withdrawRequest')}
          </button>
        </div>
      )}
    </div>
  );
}

function RequestDialog({
  performance,
  busy,
  canPause,
  onClose,
  onSend,
}: {
  performance: ManagedPerformance;
  busy: boolean;
  canPause: boolean;
  onClose: () => void;
  onSend: (input: Parameters<typeof requestDisruption>[1]) => Promise<void>;
}) {
  const { t } = useTranslation('scheduling');
  const [kind, setKind] = useState<'CANCEL' | 'POSTPONE'>('POSTPONE');
  const [reason, setReason] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [alsoPause, setAlsoPause] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (kind === 'CANCEL') return onSend({ kind, reason, alsoPause });
    const starts = resolvePerformanceDateTime(start, performance.timezone);
    const ends = resolvePerformanceDateTime(end, performance.timezone);
    if (!starts.ok || !starts.instant || !ends.ok || !ends.instant)
      return setError(t('scheduling:dateTimeNeeded'));
    if (
      Date.parse(starts.instant) <= Date.now() ||
      Date.parse(ends.instant) <= Date.parse(starts.instant)
    )
      return setError(t('scheduling:proposedInvalid'));
    return onSend({
      kind,
      reason,
      alsoPause,
      proposedStartsAt: starts.instant,
      proposedEndsAt: ends.instant,
    });
  }

  return (
    <SchedulingDialog
      title={t('scheduling:requestTitle')}
      description={t('scheduling:requestHelp')}
      onClose={onClose}
      busy={busy}
      wide
    >
      <form className="scheduling-form" onSubmit={(event) => void submit(event)}>
        <fieldset>
          <legend>{t('scheduling:requestKind')}</legend>
          {(['POSTPONE', 'CANCEL'] as const).map((value) => (
            <label key={value} className="performance-inline">
              <input
                type="radio"
                name="kind"
                checked={kind === value}
                onChange={() => setKind(value)}
              />
              {t(`request_${value}`)}
            </label>
          ))}
        </fieldset>
        <label>
          {t('scheduling:reasonLabel')}
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
            required
            rows={3}
          />
        </label>
        {kind === 'POSTPONE' && (
          <>
            <DateTimePicker
              name="proposedStart"
              label={t('scheduling:proposedStartLabel')}
              value={start}
              onChange={setStart}
              timeZone={performance.timezone}
              required
            />
            <DateTimePicker
              name="proposedEnd"
              label={t('scheduling:proposedEndLabel')}
              value={end}
              onChange={setEnd}
              timeZone={performance.timezone}
              required
            />
          </>
        )}
        {canPause && (
          <label className="performance-inline">
            <input
              type="checkbox"
              checked={alsoPause}
              onChange={(e) => setAlsoPause(e.target.checked)}
            />
            {t('scheduling:alsoPause')}
          </label>
        )}
        <p className="performance-field-help">{t('scheduling:requestNoCommit')}</p>
        {error && (
          <p className="performance-flow-error" role="alert">
            {error}
          </p>
        )}
        <div className="performance-flow-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={onClose}
            disabled={busy}
          >
            {t('scheduling:cancel')}
          </button>
          <button className="button button-primary" disabled={busy || !reason.trim()}>
            {t('scheduling:requestSend')}
          </button>
        </div>
      </form>
    </SchedulingDialog>
  );
}
