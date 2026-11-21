import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  createManagedEvent, createPerformance, createVenue, getManagedEvent, listManagedEvents, listVenues,
  type ManagedEvent, type ManagedPerformance, type Venue,
} from '../../api/performanceManagement';
import { eventPath } from '../../api/performances';
import { performanceTime } from '../../features/performance/format';
import { useAuth } from '../../features/auth/AuthContext';
import { RequireOrganizationGrant, useOrganization } from '../../features/organizations/OrganizationProvider';
import { PerformanceWorkspace } from './PerformanceWorkspace';
import './PerformanceWorkspace.css';

export function PerformanceEventAccess({ children }: { children: ReactNode }) {
  return <RequireOrganizationGrant grant="EVENTS" fallback={<PerformanceEventAccessHelp />}>
    {children}
  </RequireOrganizationGrant>;
}

function PerformanceEventAccessHelp() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const organization = useOrganization();
  const navigate = useNavigate();
  const eligible = organization?.memberships.filter((membership) => membership.grants.includes('EVENTS')) ?? [];

  return <section className="admin-empty-state" aria-labelledby="performance-event-access-title">
    <h2 id="performance-event-access-title">{t('performances:organizationEventAccessRequired')}</h2>
    {organization?.error ? <>
      <p role="alert">{organization.error}</p>
      <button type="button" className="admin-secondary-action" onClick={() => void organization.reload()}>
        {t('performances:refresh')}
      </button>
    </> : eligible.length > 0 ? <>
      <p>{t('performances:chooseEventOrganization')}</p>
      <div className="forbidden-actions">
        {eligible.map((membership) => <button key={membership.id} className="admin-secondary-action" type="button"
          onClick={() => {
            organization?.choose(membership.id);
            navigate('/organizer/events');
          }}>{membership.name}</button>)}
      </div>
    </> : <>
      <p>{t('performances:organizationEventAccessHelp')}</p>
      <div className="forbidden-actions">
        <Link className="admin-secondary-action" to="/organizer">{t('performances:acceptOrganizationInvitation')}</Link>
        {user?.role === 'ADMIN' && <Link className="admin-secondary-action" to="/admin/organizations">
          {t('performances:manageOrganizations')}
        </Link>}
      </div>
    </>}
  </section>;
}

export function PerformanceEventsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [listing, setListing] = useState<{ content: ManagedEvent[]; last: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    listManagedEvents(page, controller.signal).then((result) => {
      if (!controller.signal.aborted) setListing(result);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, [page]);

  async function addEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const created = await createManagedEvent({
        title: String(values.get('title')).trim(), description: String(values.get('description')).trim(),
        category: String(values.get('category')).trim() || null,
      });
      navigate('/organizer/events/' + encodeURIComponent(created.id));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('performances:saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="performance-admin">
      <h1>{t('performances:ticketSettingsV2')}</h1>
      {error && <p role="alert">{error}</p>}
      <section className="performance-panel">
        <h2>{t('performances:createEvent')}</h2>
        <form className="performance-form" onSubmit={(event) => void addEvent(event)}>
          <label>{t('performances:title')}<input name="title" maxLength={500} required /></label>
          <label>{t('performances:category')}<input name="category" maxLength={100} /></label>
          <label className="performance-wide">{t('performances:description')}<textarea name="description" rows={2} /></label>
          <button className="button button-primary" disabled={busy}>{t('performances:createEvent')}</button>
        </form>
      </section>
      <section className="performance-panel">
        <h2>{t('performances:eventList')}</h2>
        {!listing && !error && <p role="status">{t('performances:loading')}</p>}
        {listing?.content.map((event) => (
          <Link className="performance-event-link" key={event.id} to={'/organizer/events/' + encodeURIComponent(event.id)}>{event.title}</Link>
        ))}
        {listing && (page > 0 || !listing.last) && <div className="performance-options">
          <button type="button" className="button button-secondary" disabled={!page} onClick={() => setPage(page - 1)}>{t('performances:previous')}</button>
          <button type="button" className="button button-secondary" disabled={listing.last} onClick={() => setPage(page + 1)}>{t('performances:next')}</button>
        </div>}
      </section>
    </div>
  );
}

export function PerformanceEventPage() {
  const { eventId } = useParams();
  return eventId ? <EventWorkspace key={eventId} id={eventId} /> : null;
}

function EventWorkspace({ id }: { id: string }) {
  const { t } = useTranslation();
  const [event, setEvent] = useState<ManagedEvent | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [venueSpaceId, setVenueSpaceId] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    getManagedEvent(id, controller.signal).then((result) => {
      if (!controller.signal.aborted) setEvent(result);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    listVenues(controller.signal).then((result) => {
      if (!controller.signal.aborted) setVenues(result);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, [id]);

  const performance = event?.performances.find((entry) => entry.id === selected)
    ?? (event?.performances.length === 1 ? event.performances[0] : undefined);

  async function addVenue(submit: FormEvent<HTMLFormElement>) {
    submit.preventDefault();
    const form = submit.currentTarget;
    const values = new FormData(form);
    setBusy(true);
    setError('');
    try {
      const venue = await createVenue({
        name: String(values.get('venueName')).trim(), address: String(values.get('address')).trim(),
        spaceName: String(values.get('spaceName')).trim(),
      });
      setVenues((current) => [...current, venue]);
      setVenueSpaceId(venue.spaces[0]?.id ?? '');
      form.reset();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('performances:saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function addPerformance(submit: FormEvent<HTMLFormElement>) {
    submit.preventDefault();
    const form = submit.currentTarget;
    const values = new FormData(form);
    setBusy(true);
    setError('');
    try {
      const created = await createPerformance(id, {
        venueSpaceId, startsAt: String(values.get('startsAt')), endsAt: String(values.get('endsAt')),
        doorsOpenAt: String(values.get('doorsOpenAt')).trim() || null,
        timezone: String(values.get('timezone')), saleStartAt: String(values.get('saleStartAt')),
        saleEndAt: String(values.get('saleEndAt')), maxPerAccount: Number(values.get('maxPerAccount')),
        publicVisible: values.get('publicVisible') === 'on',
      });
      setEvent((current) => current ? { ...current, performances: [...current.performances, created] } : current);
      setSelected(created.id);
      form.reset();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('performances:saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  function updatePerformance(updated: ManagedPerformance) {
    setEvent((current) => current ? {
      ...current, performances: current.performances.map((entry) => entry.id === updated.id ? updated : entry),
    } : null);
  }

  return (
    <div className="performance-admin">
      <Link to="/organizer/events">{t('performances:events')}</Link>
      <h1>{event?.title ?? t('performances:schedule')}</h1>
      {error && <p role="alert">{error}</p>}
      {!event && !error && <p role="status">{t('performances:loading')}</p>}
      {event && <>
        <section className="performance-panel">
          <h2>{t('performances:schedule')}</h2>
          {event.performances.length === 0 && <p>{t('performances:noPerformances')}</p>}
          {event.performances.length > 1 && !performance && <p>{t('performances:choosePerformanceToConfigure')}</p>}
          {event.performances.map((entry) => (
            <button key={entry.id} type="button" className="button button-secondary" aria-pressed={entry.id === performance?.id}
              onClick={() => setSelected(entry.id)}>{entry.venueName} · {performanceTime(entry)} · {entry.status}</button>
          ))}
          {event.performances.some((entry) => entry.publicVisible && entry.status !== 'DRAFT') &&
            <Link to={eventPath(id)}>{t('performances:publicView')}</Link>}
        </section>
        {performance && <PerformanceWorkspace key={performance.id} performance={performance}
          venue={venues.find((venue) => venue.spaces.some((space) => space.id === performance.venueSpaceId))}
          onUpdate={updatePerformance} />}
        <details className="performance-panel">
          <summary>{t('performances:addPerformance')}</summary>
          <form className="performance-form" onSubmit={(submit) => void addPerformance(submit)}>
            <label>{t('performances:venueSpace')}
              <select value={venueSpaceId} onChange={(change) => setVenueSpaceId(change.target.value)} required>
                <option value="">{t('performances:chooseVenue')}</option>
                {venues.flatMap((venue) => venue.spaces.map((space) => (
                  <option key={space.id} value={space.id}>{venue.name} · {space.name}</option>
                )))}
              </select>
            </label>
            <label>{t('performances:timezone')}<input name="timezone" defaultValue="Asia/Ho_Chi_Minh" required /></label>
            <label>{t('performances:startsAt')}<input name="startsAt" placeholder="2027-06-20T19:30:00+07:00" required /></label>
            <label>{t('performances:endsAt')}<input name="endsAt" placeholder="2027-06-20T22:00:00+07:00" required /></label>
            <label>{t('performances:doorsOpenAt')}<input name="doorsOpenAt" placeholder="2027-06-20T18:30:00+07:00" /></label>
            <label>{t('performances:saleStartAt')}<input name="saleStartAt" placeholder="2027-06-01T09:00:00+07:00" required /></label>
            <label>{t('performances:saleEndAt')}<input name="saleEndAt" placeholder="2027-06-20T19:00:00+07:00" required /></label>
            <small className="performance-wide">{t('performances:timeFormat')}</small>
            <label>{t('performances:maxPerAccount')}<input name="maxPerAccount" type="number" defaultValue={4} min={1} max={100} required /></label>
            <label className="performance-inline"><input type="checkbox" name="publicVisible" defaultChecked />{t('performances:publicListing')}</label>
            <button className="button button-primary" disabled={busy}>{t('performances:addPerformance')}</button>
          </form>
        </details>
        <details className="performance-panel">
          <summary>{t('performances:addVenue')}</summary>
          <form className="performance-form" onSubmit={(submit) => void addVenue(submit)}>
            <label>{t('performances:venueName')}<input name="venueName" required /></label>
            <label>{t('performances:venueAddress')}<input name="address" required /></label>
            <label>{t('performances:spaceName')}<input name="spaceName" required /></label>
            <button className="button button-primary" disabled={busy}>{t('performances:addVenue')}</button>
          </form>
        </details>
      </>}
    </div>
  );
}
