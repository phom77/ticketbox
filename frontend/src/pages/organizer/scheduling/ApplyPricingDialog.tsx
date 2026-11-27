import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { applyPricing } from '../../../api/performanceScheduling';
import type { ManagedPerformance } from '../../../api/performanceManagement';
import { performanceTime } from '../../../features/performance/format';
import { SchedulingDialog } from './SchedulingDialog';

/** Copies the ticket types and prices of one performance to other draft dates; all targets or none. */
export function ApplyPricingDialog({
  source,
  candidates,
  onDone,
  onClose,
}: {
  source: ManagedPerformance;
  candidates: ManagedPerformance[];
  onDone: (count: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('scheduling');
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!chosen.length) return setError(t('scheduling:chooseTargets'));
    setBusy(true);
    setError('');
    try {
      await applyPricing(
        source.id,
        candidates
          .filter((entry) => chosen.includes(entry.id))
          .map((entry) => ({ performanceId: entry.id, expectedSaleVersion: entry.saleVersion })),
      );
      onDone(chosen.length);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('scheduling:saveFailed'));
      setBusy(false);
    }
  }

  return (
    <SchedulingDialog
      title={t('scheduling:applyTitle')}
      description={t('scheduling:applyHelp', { when: performanceTime(source) })}
      onClose={onClose}
      busy={busy}
    >
      <form className="scheduling-form" onSubmit={(event) => void submit(event)}>
        {candidates.length === 0 ? (
          <p role="status">{t('scheduling:applyNoTargets')}</p>
        ) : (
          <fieldset className="scheduling-targets" disabled={busy}>
            <legend>{t('scheduling:applyTargets')}</legend>
            {candidates.map((entry) => (
              <label key={entry.id} className="performance-inline">
                <input
                  type="checkbox"
                  checked={chosen.includes(entry.id)}
                  onChange={(change) =>
                    setChosen((current) =>
                      change.target.checked
                        ? [...current, entry.id]
                        : current.filter((id) => id !== entry.id),
                    )
                  }
                />
                {performanceTime(entry)}
              </label>
            ))}
          </fieldset>
        )}
        <p className="performance-field-help">{t('scheduling:applyWarning')}</p>
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
          <button className="button button-primary" disabled={busy || candidates.length === 0}>
            {busy ? t('scheduling:applying') : t('scheduling:applySubmit')}
          </button>
        </div>
      </form>
    </SchedulingDialog>
  );
}
