import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  checkInStaffGuest,
  getStaffGuests,
  type StaffGuest,
  type StaffPerformance,
} from '../../api/admin';
import { ApiClientError, isRequestCanceled } from '../../api/client';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { StaffAccessGate } from './StaffAccessGate';
import { staffDateTime, useStaffGate } from './staffPageUtils';
import './staff.css';

const pageSize = 100;

export function StaffGuestsPage() {
  const { t } = useTranslation();
  return (
    <>
      <AdminPageHeader title={t('staff:guestsTitle')} description={t('staff:guestsDescription')} />
      <StaffAccessGate select>
        {({ performance, reportDenied }) =>
          performance ? (
            <GuestDesk key={performance.id} performance={performance} reportDenied={reportDenied} />
          ) : null
        }
      </StaffAccessGate>
    </>
  );
}

function GuestDesk({
  performance,
  reportDenied,
}: {
  performance: StaffPerformance;
  reportDenied: (failure: unknown) => boolean;
}) {
  const { t } = useTranslation();
  const [gate, setGate] = useStaffGate(performance.id);
  const [guests, setGuests] = useState<StaffGuest[]>([]);
  const [nextPage, setNextPage] = useState(0);
  const [more, setMore] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState('');
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    getStaffGuests(performance.id, nextPage, pageSize, controller.signal)
      .then((page) => {
        setGuests((current) => (nextPage === 0 ? page.content : [...current, ...page.content]));
        setMore(!page.last);
        setState('ready');
      })
      .catch((failure) => {
        if (isRequestCanceled(failure) || controller.signal.aborted) return;
        if (!reportDenied(failure)) setState('error');
      });
    return () => controller.abort();
    // reportDenied identity changes with every render of the gate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [performance.id, nextPage, attempt]);

  async function checkIn(guest: StaffGuest) {
    if (!guest.guestId || busyId) return;
    setBusyId(guest.guestId);
    setFailed(null);
    try {
      const { data } = await checkInStaffGuest(performance.id, guest.guestId, gate.trim() || 'WEB');
      setGuests((current) =>
        current.map((entry) => (entry.guestId === data.guestId ? data : entry)),
      );
    } catch (failure) {
      if (!reportDenied(failure))
        setFailed({
          id: guest.guestId,
          message:
            failure instanceof ApiClientError && failure.status < 500 && failure.message
              ? failure.message
              : t('staff:guestCheckInFailed'),
        });
    } finally {
      setBusyId('');
    }
  }

  const term = query.trim().toLowerCase();
  const shown = guests.filter(
    (guest) =>
      !term ||
      (guest.fullName ?? '').toLowerCase().includes(term) ||
      (guest.phone ?? '').includes(term),
  );

  return (
    <section className="staff-panel">
      <label className="admin-field">
        {t('staff:gate')}
        <input value={gate} maxLength={100} onChange={(event) => setGate(event.target.value)} />
      </label>
      <label className="admin-field">
        <span>
          <Search aria-hidden="true" size={15} /> {t('staff:guestSearch')}
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-describedby="staff-guest-search-help"
        />
      </label>
      <small id="staff-guest-search-help">{t('staff:guestSearchHelp')}</small>
      {state === 'error' ? (
        <div role="alert">
          <p>{t('staff:guestsFailed')}</p>
          <button
            className="admin-secondary-action"
            type="button"
            onClick={() => setAttempt((v) => v + 1)}
          >
            {t('staff:retry')}
          </button>
        </div>
      ) : null}
      {state === 'loading' && !guests.length ? (
        <p role="status">{t('staff:performancesLoading')}</p>
      ) : null}
      {state === 'ready' && !guests.length ? <p>{t('staff:guestsEmpty')}</p> : null}
      {state === 'ready' && guests.length && !shown.length ? (
        <p>{t('staff:guestsNoMatch')}</p>
      ) : null}
      <ul className="staff-guest-list">
        {shown.map((guest) => (
          <li key={guest.guestId} className="staff-guest-card">
            <strong>{guest.fullName}</strong>
            <span>{guest.phone}</span>
            {guest.category ? <span>{guest.category}</span> : null}
            {guest.checkedInAt ? (
              <span className="staff-guest-checked">
                {t('staff:guestCheckedIn', {
                  time: staffDateTime(guest.checkedInAt),
                  gate: guest.checkinGate ?? t('staff:noGate'),
                })}
              </span>
            ) : (
              <button
                type="button"
                className="admin-primary-action"
                disabled={!!busyId}
                onClick={() => void checkIn(guest)}
              >
                {busyId === guest.guestId ? t('staff:guestChecking') : t('staff:guestCheckIn')}
              </button>
            )}
            {failed?.id === guest.guestId ? <p role="alert">{failed.message}</p> : null}
          </li>
        ))}
      </ul>
      {more ? (
        <button
          className="admin-secondary-action"
          type="button"
          disabled={state === 'loading'}
          onClick={() => setNextPage((page) => page + 1)}
        >
          {t('staff:loadMore')}
        </button>
      ) : null}
      <p role="status">
        {more
          ? t('staff:guestTotalLoaded', { count: guests.length })
          : t('staff:guestsLoaded', { count: guests.length })}
      </p>
    </section>
  );
}
