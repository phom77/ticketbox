import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Eye, FileBarChart, ShoppingCart } from 'lucide-react';
import { getAdminTicketTypes } from '../../api/admin';
import type { TicketType } from '../../api/concerts';
import type { ManagedPerformance } from '../../api/performanceManagement';
import { currency, dateFormatter } from '../../data/formatters';
import { useOrganization } from '../../features/organizations/OrganizationProvider';
import { supportUrl } from '../../features/ticket/buyerInformation';
import { performanceStatusKey } from './performanceSetup';
import { PerformanceGuests } from './PerformanceGuests';

/**
 * A concert created before the native workspace. Organizers can read it and run guests, orders and reports;
 * changes go through TicketBox support, so there is nothing to edit here.
 */
export function LegacyConcertSummary({
  eventId,
  performance,
  title,
}: {
  eventId: string;
  performance: ManagedPerformance;
  title: string;
}) {
  const { t } = useTranslation();
  const canViewOrders = !!useOrganization()?.selected?.grants.includes('FINANCE');
  // Times are shown where the performance takes place, whatever zone the organizer's device is in.
  const dateTime = useMemo(
    () =>
      dateFormatter({
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: performance.timezone || 'Asia/Ho_Chi_Minh',
        timeZoneName: 'short',
      }),
    [performance.timezone],
  );
  const concertId = performance.legacyConcertId ?? performance.id;
  const [types, setTypes] = useState<TicketType[] | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getAdminTicketTypes(concertId, controller.signal, 'organizer')
      .then((result) => {
        if (!controller.signal.aborted) setTypes(result);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : t('performances:saveFailed'));
      });
    return () => controller.abort();
  }, [concertId, retry, t]);

  return (
    <div className="performance-admin legacy-concert-summary">
      <section className="performance-panel performance-flow-panel" aria-labelledby="legacy-title">
        <h2 id="legacy-title">{t('event-content:legacyTitle')}</h2>
        <p className="performance-flow-help">{t('event-content:legacyHelp')}</p>
        <dl className="legacy-facts">
          <div>
            <dt>{t('event-content:legacyStatus')}</dt>
            <dd>{t(performanceStatusKey(performance))}</dd>
          </div>
          <div>
            <dt>{t('event-content:legacyStarts')}</dt>
            <dd>{dateTime.format(new Date(performance.startsAt))}</dd>
          </div>
          <div>
            <dt>{t('event-content:legacyVenue')}</dt>
            <dd>
              {performance.venueName}
              {performance.venueAddress ? <small> · {performance.venueAddress}</small> : null}
            </dd>
          </div>
          <div>
            <dt>{t('event-content:legacySales')}</dt>
            <dd>
              {dateTime.format(new Date(performance.saleStartAt))}
              {performance.saleEndAt
                ? ' – ' + dateTime.format(new Date(performance.saleEndAt))
                : ''}
            </dd>
          </div>
        </dl>
        <div className="performance-flow-actions">
          <Link
            className="button button-secondary"
            to={'/organizer/events/' + encodeURIComponent(eventId) + '/preview'}
          >
            <Eye size={17} aria-hidden="true" />
            {t('event-content:preview')}
          </Link>
          <Link
            className="button button-secondary"
            to={'/organizer/reports?concertId=' + encodeURIComponent(concertId)}
          >
            <FileBarChart size={17} aria-hidden="true" />
            {t('event-content:legacyReport')}
          </Link>
          {canViewOrders && (
            <Link
              className="button button-secondary"
              to={'/organizer/orders?concertId=' + encodeURIComponent(concertId)}
            >
              <ShoppingCart size={17} aria-hidden="true" />
              {t('event-content:legacyOrders')}
            </Link>
          )}
        </div>
      </section>

      <section
        className="performance-panel performance-flow-panel"
        aria-labelledby="legacy-tickets"
      >
        <h3 id="legacy-tickets">{t('event-content:legacyTickets')}</h3>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                setError('');
                setRetry((value) => value + 1);
              }}
            >
              {t('performances:refresh')}
            </button>
          </>
        ) : !types ? (
          <p role="status">{t('performances:loading')}</p>
        ) : !types.length ? (
          <p className="performance-flow-help">{t('event-content:legacyNoTickets')}</p>
        ) : (
          <div
            className="admin-table-wrap"
            role="region"
            aria-label={t('event-content:legacyTickets')}
            tabIndex={0}
          >
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">{t('event-content:legacyTicketName')}</th>
                  <th scope="col">{t('event-content:legacyTicketPrice')}</th>
                  <th scope="col">{t('event-content:legacyTicketAvailable')}</th>
                </tr>
              </thead>
              <tbody>
                {types.map((type) => (
                  <tr key={type.id}>
                    <td>{type.name}</td>
                    <td>{currency.format(type.price)}</td>
                    <td>
                      {type.availableQty} / {type.totalQuantity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="performance-panel performance-flow-panel" aria-labelledby="legacy-change">
        <h3 id="legacy-change">{t('event-content:requestChangeTitle')}</h3>
        <p className="performance-flow-help">{t('event-content:requestChangeBody', { title })}</p>
        {supportUrl ? (
          <a className="button button-primary" href={supportUrl} target="_blank" rel="noreferrer">
            {t('event-content:requestChangeAction')}
          </a>
        ) : (
          <p className="performance-flow-help">{t('event-content:requestChangeNoContact')}</p>
        )}
      </section>

      <h3 className="performance-step-heading">{t('event-content:guestsTitle')}</h3>
      <PerformanceGuests performanceId={concertId} label={title} released />
    </div>
  );
}
