import { WorkspaceSelect } from '../../components/WorkspaceSelect';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Plus } from 'lucide-react';
import {
  createPerformance,
  createVenue,
  updatePerformanceSchedule,
  type ManagedPerformance,
  type Venue,
} from '../../api/performanceManagement';
import { ApiClientError } from '../../api/client';
import { PerformanceDateTimeField, PerformanceTimeZoneField } from './PerformanceDateTimeField';
import {
  DEFAULT_PERFORMANCE_TIME_ZONE,
  resolvePerformanceDateTime,
  toPerformanceLocalDateTime,
} from './performanceDateTime';

const dateFields = ['startsAt', 'endsAt', 'doorsOpenAt', 'saleStartAt', 'saleEndAt'] as const;
type DateField = (typeof dateFields)[number];
type Dates = Record<DateField, string>;
type FieldErrors = Partial<Record<DateField, string>>;

export function PerformanceScheduleForm({
  eventId,
  performance,
  reuseFrom,
  venues,
  venueLoadError,
  onRetryVenues,
  onVenueCreated,
  onSave,
  onDirtyChange,
  onBusyChange,
  onReload,
}: {
  eventId: string;
  performance?: ManagedPerformance;
  reuseFrom?: ManagedPerformance;
  venues: Venue[] | null;
  venueLoadError: string;
  onReload: () => void;
  onRetryVenues: () => void;
  onVenueCreated: (venue: Venue) => void;
  onSave: (performance: ManagedPerformance) => void;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const { t } = useTranslation('performances');
  const [timezone, setTimezone] = useState(performance?.timezone ?? DEFAULT_PERFORMANCE_TIME_ZONE);
  const [dates, setDates] = useState(
    () =>
      Object.fromEntries(
        dateFields.map((field) => [
          field,
          toPerformanceLocalDateTime(performance?.[field], timezone),
        ]),
      ) as Dates,
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [venueSpaceId, setVenueSpaceId] = useState(performance?.venueSpaceId ?? '');
  const [maxPerAccount, setMaxPerAccount] = useState(String(performance?.maxPerAccount ?? 4));
  const [reusedVenue, setReusedVenue] = useState(false);
  const [shortcutError, setShortcutError] = useState('');
  const [venueError, setVenueError] = useState('');
  const [addingVenue, setAddingVenue] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [missingVenue, setMissingVenue] = useState(false);
  const [conflict, setConflict] = useState(false);
  const venueFormId = useId();
  const venueForm = useRef<HTMLFormElement>(null);
  const venueToggle = useRef<HTMLButtonElement>(null);
  const venueSelect = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (addingVenue) venueForm.current?.querySelector('input')?.focus();
  }, [addingVenue]);

  function setLoading(value: boolean) {
    setBusy(value);
    onBusyChange(value);
  }

  async function saveVenue(submit: FormEvent<HTMLFormElement>) {
    submit.preventDefault();
    const values = new FormData(submit.currentTarget);
    const name = String(values.get('venueName')).trim();
    const address = String(values.get('address')).trim();
    const spaceName = String(values.get('spaceName')).trim();
    if (!name || !address || !spaceName) {
      setVenueError(t('performances:venueFieldsRequired'));
      return;
    }
    setLoading(true);
    setVenueError('');
    try {
      const created = await createVenue({ name, address, spaceName });
      onVenueCreated(created);
      setVenueSpaceId(created.spaces[0].id);
      setMissingVenue(false);
      setReusedVenue(false);
      onDirtyChange(true);
      setAddingVenue(false);
      requestAnimationFrame(() => venueSelect.current?.focus());
    } catch (failure) {
      setVenueError(failure instanceof Error ? failure.message : t('performances:saveFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function saveSchedule(submit: FormEvent<HTMLFormElement>) {
    submit.preventDefault();
    const form = submit.currentTarget;
    if (!venueSpaceId) {
      setMissingVenue(true);
      venueSelect.current?.focus();
      return;
    }
    const values = new FormData(form);
    const nextErrors: FieldErrors = {};
    const instants: Partial<Record<DateField, string>> = {};
    for (const field of dateFields) {
      const result = resolvePerformanceDateTime(
        dates[field],
        timezone,
        performance?.timezone === timezone ? performance[field] : undefined,
      );
      if (!result.ok) nextErrors[field] = t(`performances:dateTime_${result.reason}`);
      else if (result.instant) instants[field] = result.instant;
      else if (field !== 'doorsOpenAt')
        nextErrors[field] = t('performances:scheduleDateTimeRequired');
    }
    const { startsAt, endsAt, doorsOpenAt, saleStartAt, saleEndAt } = instants;
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt))
      nextErrors.endsAt = t('performances:scheduleEndAfterStart');
    if (startsAt && doorsOpenAt && Date.parse(doorsOpenAt) > Date.parse(startsAt))
      nextErrors.doorsOpenAt = t('performances:scheduleDoorsBeforeStart');
    if (saleStartAt && saleEndAt && Date.parse(saleStartAt) >= Date.parse(saleEndAt))
      nextErrors.saleEndAt = t('performances:scheduleSaleEndAfterOpening');
    if (startsAt && saleEndAt && Date.parse(saleEndAt) > Date.parse(startsAt))
      nextErrors.saleEndAt = t('performances:scheduleSaleEndBeforeShow');
    setFieldErrors(nextErrors);
    const firstError = dateFields.find((field) => nextErrors[field]);
    if (firstError) {
      form.querySelector<HTMLInputElement>(`input[name="${firstError}"]`)?.focus();
      return;
    }
    if (!startsAt || !endsAt || !saleStartAt || !saleEndAt || !venueSpaceId || addingVenue) return;
    setLoading(true);
    setError('');
    setConflict(false);
    try {
      const body = {
        venueSpaceId,
        startsAt,
        endsAt,
        doorsOpenAt: doorsOpenAt ?? null,
        timezone,
        saleStartAt,
        saleEndAt,
        maxPerAccount: Number(values.get('maxPerAccount')),
        publicVisible: values.get('publicVisible') === 'on',
      };
      const saved = performance
        ? await updatePerformanceSchedule(performance.id, performance.draftVersion, body)
        : await createPerformance(eventId, body);
      onSave(saved);
    } catch (failure) {
      setConflict(failure instanceof ApiClientError && failure.status === 409);
      setError(failure instanceof Error ? failure.message : t('performances:saveFailed'));
    } finally {
      setLoading(false);
    }
  }

  function reuseVenue() {
    if (!reuseFrom) return;
    setTimezone(reuseFrom.timezone);
    setVenueSpaceId(reuseFrom.venueSpaceId);
    setMissingVenue(false);
    setMaxPerAccount(String(reuseFrom.maxPerAccount));
    setReusedVenue(true);
    onDirtyChange(true);
  }

  function setShowRelative(field: DateField, minutes: number) {
    const start = resolvePerformanceDateTime(
      dates.startsAt,
      timezone,
      performance?.timezone === timezone ? performance.startsAt : undefined,
    );
    if (!start.ok || !start.instant) {
      setShortcutError(t('performances:setupChooseStartFirst'));
      return;
    }
    setTime(field, new Date(Date.parse(start.instant) + minutes * 60_000).toISOString());
  }

  function setTime(field: DateField, instant: string) {
    const value = toPerformanceLocalDateTime(instant, timezone);
    const resolved = resolvePerformanceDateTime(value, timezone);
    if (!resolved.ok) {
      setShortcutError(t(`performances:dateTime_${resolved.reason}`));
      return;
    }
    setDates((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setShortcutError('');
    onDirtyChange(true);
  }

  function timeField(name: DateField, label: string) {
    return (
      <PerformanceDateTimeField
        name={name}
        label={label}
        value={dates[name]}
        error={fieldErrors[name]}
        required={name !== 'doorsOpenAt'}
        onChange={(value) => {
          setDates((current) => ({ ...current, [name]: value }));
          setFieldErrors((current) => ({ ...current, [name]: undefined }));
          setShortcutError('');
        }}
      />
    );
  }

  return (
    <section className="performance-panel performance-flow-panel">
      <p className="performance-flow-help">
        {t(performance ? 'performances:scheduleStepHelp' : 'performances:setupNewShowHelp')}
      </p>
      {reuseFrom && !performance && (
        <div className="performance-reuse-venue">
          <div>
            <p>
              {t(
                reusedVenue ? 'performances:setupReusedVenue' : 'performances:setupReuseVenueHelp',
              )}
            </p>
          </div>
          {!reusedVenue && (
            <button
              type="button"
              className="button button-secondary"
              disabled={!venues || busy || Object.values(dates).some(Boolean)}
              onClick={reuseVenue}
            >
              {t('performances:setupReuseVenue')}
            </button>
          )}
        </div>
      )}
      <form
        className="performance-venue-editor"
        id={venueFormId}
        ref={venueForm}
        hidden={!addingVenue}
        onSubmit={(submit) => void saveVenue(submit)}
        onChange={() => onDirtyChange(true)}
      >
        <fieldset className="performance-form" disabled={busy || !addingVenue}>
          <legend>{t('performances:addVenue')}</legend>
          <label>
            {t('performances:venueName')}
            <input name="venueName" required maxLength={500} />
          </label>
          <label>
            {t('performances:spaceName')}
            <input name="spaceName" required maxLength={200} />
          </label>
          <label className="performance-wide">
            {t('performances:venueAddress')}
            <input name="address" required maxLength={1000} />
          </label>
          {venueError && (
            <p className="performance-wide performance-flow-error" role="alert">
              {venueError}
            </p>
          )}
          <div className="performance-wide performance-options">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                venueForm.current?.reset();
                setAddingVenue(false);
                setVenueError('');
                venueToggle.current?.focus();
              }}
            >
              {t('performances:cancel')}
            </button>
            <button className="button button-primary">
              {t(busy ? 'savingChanges' : 'saveVenue')}
            </button>
          </div>
        </fieldset>
      </form>
      {venueLoadError && (
        <div className="performance-options">
          <p role="alert">{venueLoadError}</p>
          <button className="button button-secondary" type="button" onClick={onRetryVenues}>
            {t('performances:refresh')}
          </button>
        </div>
      )}
      <form
        className="performance-schedule-form"
        onSubmit={(submit) => void saveSchedule(submit)}
        onChange={() => onDirtyChange(true)}
      >
        <fieldset className="performance-form performance-schedule-section" disabled={busy}>
          <legend>{t('performances:venueHeading')}</legend>
          <label>
            {t('performances:scheduleVenueSpace')}
            <WorkspaceSelect
              ref={venueSelect}
              label={t('performances:scheduleVenueSpace')}
              value={venueSpaceId}
              disabled={addingVenue}
              required
              invalid={missingVenue}
              describedBy={missingVenue ? 'schedule-venue-error' : undefined}
              placeholder={t(venues ? 'chooseVenue' : 'loading')}
              onChange={(value) => {
                setVenueSpaceId(value);
                setMissingVenue(false);
                setReusedVenue(false);
                onDirtyChange(true);
              }}
              options={[
                ...(performance &&
                !venues?.some((venue) =>
                  venue.spaces.some((space) => space.id === performance.venueSpaceId),
                )
                  ? [
                      {
                        value: performance.venueSpaceId,
                        label: `${performance.venueName} · ${performance.spaceName}`,
                      },
                    ]
                  : []),
                ...(venues ?? []).flatMap((venue) =>
                  venue.spaces.map((space) => ({
                    value: space.id,
                    label: `${venue.name} · ${space.name}`,
                  })),
                ),
              ]}
            />
            {missingVenue && (
              <small className="performance-field-error" id="schedule-venue-error">
                {t('performances:chooseVenue')}
              </small>
            )}
          </label>
          <PerformanceTimeZoneField
            label={t('performances:timezone')}
            value={timezone}
            onChange={(value) => {
              setTimezone(value);
              setFieldErrors({});
              onDirtyChange(true);
              setReusedVenue(false);
              setShortcutError('');
            }}
          />
          <div className="performance-wide">
            <button
              type="button"
              className="button button-secondary"
              disabled={!venues || addingVenue}
              aria-expanded={addingVenue}
              aria-controls={venueFormId}
              ref={venueToggle}
              onClick={() => {
                setVenueError('');
                setAddingVenue(true);
              }}
            >
              <Plus size={17} aria-hidden />
              {t('performances:addVenue')}
            </button>
          </div>
        </fieldset>
        <fieldset className="performance-form performance-schedule-section" disabled={busy}>
          <legend>{t('performances:doorsAndShowTimes')}</legend>
          {timeField('startsAt', t('performances:scheduleStart'))}
          {timeField('endsAt', t('performances:scheduleEnd'))}
          {timeField('doorsOpenAt', t('performances:doorsOptional'))}
          <div
            className="performance-wide performance-schedule-shortcuts"
            aria-label={t('performances:setupSchedulePresets')}
            role="group"
          >
            <button
              type="button"
              disabled={!dates.startsAt}
              className="button button-secondary"
              onClick={() => setShowRelative('endsAt', 120)}
            >
              {t('performances:setupDurationTwoHours')}
            </button>
            <button
              type="button"
              disabled={!dates.startsAt}
              className="button button-secondary"
              onClick={() => setShowRelative('doorsOpenAt', -30)}
            >
              {t('performances:setupDoorsThirtyMinutes')}
            </button>
          </div>
        </fieldset>
        <fieldset className="performance-form performance-schedule-section" disabled={busy}>
          <legend>{t('performances:saleWindowAndLimits')}</legend>
          {timeField('saleStartAt', t('performances:saleStartAt'))}
          {timeField('saleEndAt', t('performances:saleEndAt'))}
          <label>
            {t('performances:maxPerAccount')}
            <input
              name="maxPerAccount"
              type="number"
              value={maxPerAccount}
              onChange={(change) => setMaxPerAccount(change.currentTarget.value)}
              min={1}
              max={100}
              required
            />
          </label>
          <div
            className="performance-wide performance-schedule-shortcuts"
            aria-label={t('performances:setupSaleTimingHelp')}
            role="group"
          >
            {!performance && (
              <button
                type="button"
                className="button button-secondary"
                onClick={() =>
                  setTime(
                    'saleStartAt',
                    new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString(),
                  )
                }
              >
                {t('performances:setupOpenNow')}
              </button>
            )}
            <button
              type="button"
              disabled={!dates.startsAt}
              className="button button-secondary"
              onClick={() => setShowRelative('saleEndAt', 0)}
            >
              {t('performances:setupCloseAtShow')}
            </button>
          </div>
          <label className="performance-wide performance-inline">
            <input
              type="checkbox"
              name="publicVisible"
              defaultChecked={performance?.publicVisible ?? true}
            />
            {t('performances:publicListingAfterPublish')}
          </label>
          {performance && (
            <p className="performance-wide performance-flow-help">
              {t('performances:scheduleChangeOffersHelp')}
            </p>
          )}
        </fieldset>
        {(error || shortcutError || Object.values(fieldErrors).some(Boolean)) && (
          <p className="performance-flow-error" role="alert">
            {error || shortcutError || t('performances:scheduleFixTimes')}
          </p>
        )}
        <div className="performance-flow-actions">
          {conflict && (
            <button type="button" className="button button-secondary" onClick={onReload}>
              {t('performances:reloadDraft')}
            </button>
          )}
          <button
            className="button button-primary"
            disabled={busy || addingVenue || (!venues && !performance)}
          >
            {t(busy ? 'savingChanges' : 'saveAndContinue')}
            <ArrowRight size={17} aria-hidden />
          </button>
        </div>
      </form>
    </section>
  );
}
