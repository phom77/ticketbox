import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { WorkspaceSelect } from '../../../components/WorkspaceSelect';
import { ApiClientError } from '../../../api/client';
import { createVenue, type Venue } from '../../../api/performanceManagement';
import { addVenueSpace, renameVenueSpace, updateVenue } from '../../../api/performanceScheduling';
import { PerformanceTimeZoneField } from '../PerformanceDateTimeField';
import { SchedulingDialog } from './SchedulingDialog';

/** The organization's venue library: edit a venue, manage its spaces and add venues. */
export function VenueLibraryDialog({
  venues,
  onChange,
  onClose,
}: {
  venues: Venue[];
  onChange: (venue: Venue) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('scheduling');
  const [selected, setSelected] = useState(venues[0]?.id ?? '');
  // Kept here: the editor remounts with every new venue version, which would clear its own message.
  const [saved, setSaved] = useState('');
  const venue = venues.find((entry) => entry.id === selected);
  return (
    <SchedulingDialog
      title={t('scheduling:venuesTitle')}
      description={t('scheduling:venuesHelp')}
      onClose={onClose}
      wide
    >
      <div className="scheduling-panel">
        {venues.length > 0 && (
          <label>
            {t('scheduling:venue')}
            <WorkspaceSelect
              label={t('scheduling:venue')}
              value={selected}
              onChange={(value) => {
                setSelected(value);
                setSaved('');
              }}
              options={venues.map((entry) => ({ value: entry.id, label: entry.name }))}
            />
          </label>
        )}
        {venue && (
          <VenueEditor
            key={venue.id + venue.version}
            venue={venue}
            onChange={onChange}
            saved={saved}
            onSaved={setSaved}
          />
        )}
        <NewVenue onCreated={(created) => (onChange(created), setSelected(created.id))} />
      </div>
    </SchedulingDialog>
  );
}

function VenueEditor({
  venue,
  onChange,
  saved,
  onSaved: setSaved,
}: {
  venue: Venue;
  onChange: (venue: Venue) => void;
  saved: string;
  onSaved: (message: string) => void;
}) {
  const { t } = useTranslation('scheduling');
  const [name, setName] = useState(venue.name);
  const [address, setAddress] = useState(venue.address);
  const [city, setCity] = useState(venue.city ?? '');
  const [timezone, setTimezone] = useState(venue.timezone);
  const [hint, setHint] = useState(venue.capacityHint ? String(venue.capacityHint) : '');
  const [space, setSpace] = useState('');
  const [error, setError] = useState('');
  const [inUse, setInUse] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<Venue>, done: string) {
    setBusy(true);
    setError('');
    setSaved('');
    setInUse(false);
    try {
      onChange(await action());
      setSaved(done);
    } catch (failure) {
      setInUse(failure instanceof ApiClientError && failure.status === 409);
      setError(failure instanceof Error ? failure.message : t('scheduling:saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    void run(
      () =>
        updateVenue(venue.id, {
          expectedVersion: venue.version,
          name,
          address,
          city: city.trim() || null,
          timezone,
          capacityHint: hint.trim() ? Number(hint) : null,
        }),
      t('scheduling:venueSaved'),
    );
  }

  return (
    <section className="scheduling-panel" aria-label={venue.name}>
      <form className="scheduling-form" onSubmit={save}>
        <label>
          {t('scheduling:venueName')}
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={500} />
        </label>
        <label>
          {t('scheduling:venueAddress')}
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
            maxLength={1000}
          />
        </label>
        <p className="performance-field-help">{t('scheduling:venueLockHelp')}</p>
        <label>
          {t('scheduling:venueCity')}
          <input value={city} onChange={(e) => setCity(e.target.value)} maxLength={120} />
        </label>
        <PerformanceTimeZoneField
          label={t('scheduling:venueZone')}
          value={timezone}
          onChange={setTimezone}
        />
        <label>
          {t('scheduling:capacityHint')}
          <input
            type="number"
            min={1}
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            aria-describedby="capacity-hint-help"
          />
          <small id="capacity-hint-help" className="performance-field-help">
            {t('scheduling:capacityHintHelp')}
          </small>
        </label>
        <div className="performance-flow-actions">
          <button className="button button-primary" disabled={busy}>
            {t('scheduling:saveVenue')}
          </button>
        </div>
      </form>
      <h3>{t('scheduling:spaces')}</h3>
      <ul className="scheduling-list">
        {venue.spaces.map((entry) => (
          <SpaceRow
            key={entry.id}
            venue={venue}
            id={entry.id}
            name={entry.name}
            run={run}
            busy={busy}
          />
        ))}
      </ul>
      <form
        className="scheduling-form"
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => addVenueSpace(venue.id, space), t('scheduling:spaceAdded')).then(() =>
            setSpace(''),
          );
        }}
      >
        <label>
          {t('scheduling:newSpace')}
          <input
            value={space}
            onChange={(e) => setSpace(e.target.value)}
            maxLength={200}
            required
          />
        </label>
        <div className="performance-flow-actions">
          <button className="button button-secondary" disabled={busy || !space.trim()}>
            {t('scheduling:addSpace')}
          </button>
        </div>
      </form>
      {saved && <p role="status">{saved}</p>}
      {error && (
        <p className="performance-flow-error" role="alert">
          {error} {inUse && t('scheduling:createNewVenueHint')}
        </p>
      )}
    </section>
  );
}

function SpaceRow({
  venue,
  id,
  name,
  run,
  busy,
}: {
  venue: Venue;
  id: string;
  name: string;
  run: (action: () => Promise<Venue>, done: string) => Promise<void>;
  busy: boolean;
}) {
  const { t } = useTranslation('scheduling');
  const [value, setValue] = useState(name);
  return (
    <li>
      <label>
        {t('scheduling:spaceName')}
        <input value={value} onChange={(e) => setValue(e.target.value)} maxLength={200} />
      </label>
      <div className="performance-flow-actions">
        <button
          type="button"
          className="button button-secondary"
          disabled={busy || !value.trim() || value.trim() === name}
          onClick={() =>
            void run(() => renameVenueSpace(venue.id, id, value), t('scheduling:spaceRenamed'))
          }
        >
          {t('scheduling:renameSpace')}
        </button>
      </div>
    </li>
  );
}

function NewVenue({ onCreated }: { onCreated: (venue: Venue) => void }) {
  const { t } = useTranslation('scheduling');
  const form = useRef<HTMLFormElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      onCreated(
        await createVenue({
          name: String(values.get('name')).trim(),
          address: String(values.get('address')).trim(),
          spaceName: String(values.get('space')).trim(),
        }),
      );
      form.current?.reset();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('scheduling:saveFailed'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary>{t('scheduling:newVenue')}</summary>
      <form className="scheduling-form" ref={form} onSubmit={(event) => void submit(event)}>
        <label>
          {t('scheduling:venueName')}
          <input name="name" required maxLength={500} />
        </label>
        <label>
          {t('scheduling:venueAddress')}
          <input name="address" required maxLength={1000} />
        </label>
        <label>
          {t('scheduling:firstSpace')}
          <input name="space" required maxLength={200} />
        </label>
        {error && (
          <p className="performance-flow-error" role="alert">
            {error}
          </p>
        )}
        <div className="performance-flow-actions">
          <button className="button button-secondary" disabled={busy}>
            {t('scheduling:createVenue')}
          </button>
        </div>
      </form>
    </details>
  );
}
