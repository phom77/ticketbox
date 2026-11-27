import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { duplicatePerformance } from '../../../api/performanceScheduling';
import type { ManagedPerformance } from '../../../api/performanceManagement';
import { DateTimePicker } from '../../../components/date/DateTimePicker';
import { resolvePerformanceDateTime, toPerformanceLocalDateTime } from '../performanceDateTime';
import { SchedulingDialog } from './SchedulingDialog';

/** Duplicates a performance into a draft at a new start; every time shifts by the same offset. */
export function DuplicateDialog({
  performance,
  onDone,
  onClose,
}: {
  performance: ManagedPerformance;
  onDone: (copy: ManagedPerformance) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('scheduling');
  const [start, setStart] = useState(
    toPerformanceLocalDateTime(
      new Date(Date.parse(performance.startsAt) + 7 * 86_400_000).toISOString(),
      performance.timezone,
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const resolved = resolvePerformanceDateTime(start, performance.timezone);
    if (!resolved.ok || !resolved.instant) return setError(t('scheduling:dateTimeNeeded'));
    if (Date.parse(resolved.instant) <= Date.now()) return setError(t('scheduling:startInFuture'));
    setBusy(true);
    setError('');
    try {
      onDone(await duplicatePerformance(performance.id, resolved.instant));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('scheduling:saveFailed'));
      setBusy(false);
    }
  }

  return (
    <SchedulingDialog
      title={t('scheduling:duplicateTitle')}
      description={t('scheduling:duplicateHelp')}
      onClose={onClose}
      busy={busy}
    >
      <form className="scheduling-form" onSubmit={(event) => void submit(event)}>
        <DateTimePicker
          name="duplicateStart"
          label={t('scheduling:newStart')}
          value={start}
          onChange={setStart}
          timeZone={performance.timezone}
          required
          disabled={busy}
        />
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
          <button className="button button-primary" disabled={busy}>
            {busy ? t('scheduling:duplicating') : t('scheduling:duplicateSubmit')}
          </button>
        </div>
      </form>
    </SchedulingDialog>
  );
}
