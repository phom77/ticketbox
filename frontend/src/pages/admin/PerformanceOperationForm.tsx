import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  OperationsPerformance,
  PerformanceDisruptionInput,
  PerformanceSchedule,
} from '../../api/performanceOperations';
import { PerformanceDateTimeField } from '../organizer/PerformanceDateTimeField';
import {
  resolvePerformanceDateTime,
  toPerformanceLocalDateTime,
} from '../organizer/performanceDateTime';

const scheduleFields = [
  ['startsAt', 'performances:scheduleStart'],
  ['endsAt', 'performances:scheduleEnd'],
  ['doorsOpenAt', 'performances:doorsOptional'],
  ['saleStartAt', 'performances:saleStartAt'],
  ['saleEndAt', 'performances:saleEndAt'],
] as const;
type ScheduleField = keyof PerformanceSchedule;
type Errors = Partial<Record<ScheduleField, string>>;

export function PerformanceOperationForm({
  performance,
  kind,
  onReview,
  onCancel,
}: {
  performance: OperationsPerformance;
  kind: PerformanceDisruptionInput['kind'];
  onReview: (input: PerformanceDisruptionInput) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('performance-operations');
  const [dates, setDates] = useState(
    () =>
      Object.fromEntries(
        scheduleFields.map(([field]) => [
          field,
          toPerformanceLocalDateTime(performance[field], performance.timezone),
        ]),
      ) as Record<ScheduleField, string>,
  );
  const [errors, setErrors] = useState<Errors>({});
  const [reasonError, setReasonError] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const reason = String(new FormData(form).get('reason') ?? '').trim();
    setReasonError(!reason);
    if (!reason) {
      form.querySelector<HTMLTextAreaElement>('textarea')?.focus();
      return;
    }
    if (kind === 'CANCEL') {
      onReview({ kind, reason });
      return;
    }
    const localErrors: Errors = {};
    const instants = {} as Record<ScheduleField, string | null>;
    for (const [field] of scheduleFields) {
      const result = resolvePerformanceDateTime(
        dates[field],
        performance.timezone,
        performance[field],
      );
      if (!result.ok) localErrors[field] = t(`performances:dateTime_${result.reason}`);
      else if (!result.instant && field !== 'doorsOpenAt')
        localErrors[field] = t('performances:scheduleDateTimeRequired');
      else instants[field] = result.instant;
    }
    const { startsAt, endsAt, doorsOpenAt, saleStartAt, saleEndAt } = instants;
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
      localErrors.endsAt = t('performances:scheduleEndAfterStart');
    }
    if (startsAt && doorsOpenAt && Date.parse(doorsOpenAt) > Date.parse(startsAt)) {
      localErrors.doorsOpenAt = t('performances:scheduleDoorsBeforeStart');
    }
    if (saleStartAt && saleEndAt && Date.parse(saleStartAt) >= Date.parse(saleEndAt)) {
      localErrors.saleEndAt = t('performances:scheduleSaleEndAfterOpening');
    }
    if (startsAt && saleEndAt && Date.parse(saleEndAt) > Date.parse(startsAt)) {
      localErrors.saleEndAt = t('performances:scheduleSaleEndBeforeShow');
    } else if (saleEndAt && Date.parse(saleEndAt) <= Date.now()) {
      localErrors.saleEndAt = t('performance-operations:futureSaleEnd');
    }
    if (
      startsAt === performance.startsAt &&
      endsAt === performance.endsAt &&
      doorsOpenAt === performance.doorsOpenAt
    ) {
      localErrors.startsAt = t('performance-operations:changeDates');
    }
    setErrors(localErrors);
    const first = scheduleFields.find(([field]) => localErrors[field])?.[0];
    if (first) form.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
    else if (startsAt && endsAt && saleStartAt && saleEndAt) {
      onReview({ kind, reason, startsAt, endsAt, doorsOpenAt, saleStartAt, saleEndAt });
    }
  }

  return (
    <form className="performance-ops-form" onSubmit={submit}>
      <h3>{t(`action_${kind}`)}</h3>
      {kind === 'POSTPONE' && (
        <fieldset className="performance-ops-dates">
          <legend>
            {t('performance-operations:localSchedule', {
              zone: performance.timezone.replace(/_/g, ' '),
            })}
          </legend>
          {scheduleFields.map(([field, label]) => (
            <PerformanceDateTimeField
              key={field}
              name={field}
              label={t(label)}
              value={dates[field]}
              required={field !== 'doorsOpenAt'}
              error={errors[field]}
              onChange={(value) => {
                setDates((current) => ({ ...current, [field]: value }));
                setErrors((current) => ({ ...current, [field]: undefined }));
              }}
            />
          ))}
          <p>{t('performance-operations:offerWindowHelp')}</p>
        </fieldset>
      )}
      <label>
        {t('performances:reason')}
        <textarea
          name="reason"
          rows={3}
          required
          maxLength={1000}
          aria-invalid={reasonError || undefined}
          aria-describedby={reasonError ? 'operation-reason-error' : undefined}
          onChange={() => setReasonError(false)}
        />
        {reasonError && (
          <small id="operation-reason-error" className="performance-field-error">
            {t('performance-operations:reasonRequired')}
          </small>
        )}
      </label>
      <div className="performance-ops-form-actions">
        <button type="button" className="button button-secondary" onClick={onCancel}>
          {t('performance-operations:dismissForm')}
        </button>
        <button type="submit" className="button button-primary">
          {t('performance-operations:reviewChange')}
        </button>
      </div>
    </form>
  );
}
