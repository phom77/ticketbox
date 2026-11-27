import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { WorkspaceSelect } from '../../../components/WorkspaceSelect';
import { MultiDatePicker } from '../../../components/date/MultiDatePicker';
import { addPerformanceDates } from '../../../api/performanceScheduling';
import type { ManagedPerformance, Venue } from '../../../api/performanceManagement';
import { resolvePerformanceDateTime } from '../performanceDateTime';
import { formatLanguage } from '../../../i18n';
import { formatDay } from '../../../components/date/dateMath';
import { SchedulingDialog } from './SchedulingDialog';
import { TimePicker } from './TimePicker';

function todayIn(timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

/** Creates one draft performance per chosen day, all or none, optionally copying an existing performance. */
export function AddDatesDialog({
  eventId,
  performances,
  venues,
  defaultSource,
  onDone,
  onClose,
}: {
  eventId: string;
  performances: ManagedPerformance[];
  venues: Venue[];
  defaultSource?: ManagedPerformance;
  onDone: (created: ManagedPerformance[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('scheduling');
  const locale = formatLanguage();
  const copyable = performances.filter((entry) => !entry.legacyConcertId);
  const [source, setSource] = useState(defaultSource?.id ?? '');
  const [days, setDays] = useState<string[]>([]);
  const [time, setTime] = useState('19:00');
  const [duration, setDuration] = useState('120');
  const [doors, setDoors] = useState('30');
  const [space, setSpace] = useState(defaultSource?.venueSpaceId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const copyFrom = copyable.find((entry) => entry.id === source);
  const spaceVenue = venues.find((venue) => venue.spaces.some((entry) => entry.id === space));
  const timezone = copyFrom?.timezone ?? spaceVenue?.timezone ?? 'Asia/Ho_Chi_Minh';

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!days.length) return setError(t('scheduling:chooseDays'));
    if (!time) return setError(t('scheduling:timeInvalid'));
    if (!copyFrom && !space) return setError(t('scheduling:chooseSpace'));
    const problems: string[] = [];
    const startsAt: string[] = [];
    for (const day of days.sort()) {
      const resolved = resolvePerformanceDateTime(`${day}T${time}`, timezone);
      if (resolved.ok && resolved.instant) startsAt.push(resolved.instant);
      else problems.push(formatDay(day, locale, { dateStyle: 'medium' }));
    }
    if (problems.length)
      return setError(t('scheduling:daysSkippedByClock', { days: problems.join(', ') }));
    setBusy(true);
    try {
      const created = await addPerformanceDates(
        eventId,
        copyFrom
          ? { startsAt, sourcePerformanceId: copyFrom.id }
          : {
              startsAt,
              venueSpaceId: space,
              timezone,
              durationMinutes: Number(duration),
              doorsBeforeMinutes: Number(doors),
            },
      );
      onDone(created);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('scheduling:saveFailed'));
      setBusy(false);
    }
  }

  return (
    <SchedulingDialog
      title={t('scheduling:addDatesTitle')}
      description={t('scheduling:addDatesHelp')}
      onClose={onClose}
      busy={busy}
      wide
    >
      <form className="scheduling-form" onSubmit={(event) => void submit(event)}>
        <MultiDatePicker
          label={t('scheduling:chooseDaysLabel')}
          value={days}
          onChange={setDays}
          min={todayIn(timezone)}
          limit={30}
          disabled={busy}
        />
        <div className="scheduling-fields">
          <TimePicker
            label={t('scheduling:startTime')}
            value={time}
            onChange={setTime}
            disabled={busy}
          />
          <p className="performance-field-help">
            {t('scheduling:inZone', { zone: timezone.replace(/_/g, ' ') })}
          </p>
          <label>
            {t('scheduling:copyFrom')}
            <WorkspaceSelect
              label={t('scheduling:copyFrom')}
              value={source}
              disabled={busy}
              onChange={setSource}
              options={[
                { value: '', label: t('scheduling:copyNothing') },
                ...copyable.map((entry) => ({
                  value: entry.id,
                  label: new Intl.DateTimeFormat(locale, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: entry.timezone,
                  }).format(new Date(entry.startsAt)),
                })),
              ]}
            />
          </label>
          {!copyFrom && (
            <>
              <label>
                {t('scheduling:venueSpace')}
                <WorkspaceSelect
                  label={t('scheduling:venueSpace')}
                  value={space}
                  disabled={busy}
                  required
                  onChange={setSpace}
                  options={venues.flatMap((venue) =>
                    venue.spaces.map((entry) => ({
                      value: entry.id,
                      label: `${venue.name} · ${entry.name}`,
                    })),
                  )}
                />
              </label>
              <label>
                {t('scheduling:durationMinutes')}
                <input
                  type="number"
                  min={1}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </label>
              <label>
                {t('scheduling:doorsBefore')}
                <input
                  type="number"
                  min={0}
                  value={doors}
                  onChange={(e) => setDoors(e.target.value)}
                />
              </label>
            </>
          )}
        </div>
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
            {busy ? t('scheduling:adding') : t('scheduling:addDatesSubmit', { count: days.length })}
          </button>
        </div>
      </form>
    </SchedulingDialog>
  );
}
