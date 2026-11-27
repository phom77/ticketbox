import { CalendarDays, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { StaffPerformance } from '../../api/admin';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { StaffAccessGate } from './StaffAccessGate';
import { splitEarlier, staffDateTime } from './staffPageUtils';

function PerformanceRow({ performance }: { performance: StaffPerformance }) {
  const { t } = useTranslation();
  const query = `?performance=${encodeURIComponent(performance.id)}`;
  return (
    <article className="staff-concert-row">
      <div className="staff-concert-date">
        <CalendarDays aria-hidden="true" size={18} />
        <strong>{staffDateTime(performance.eventDate)}</strong>
      </div>
      <div>
        <h2>{performance.title}</h2>
        <p>
          <MapPin aria-hidden="true" size={14} />
          {performance.venueName}
        </p>
        <p>
          {t('staff:statusLabel')}:{' '}
          {t(`staff:status_${performance.status}`, { defaultValue: performance.status })}
        </p>
      </div>
      <nav aria-label={performance.title} className="staff-row-links">
        <Link className="admin-primary-action" to={`/staff/check-in${query}`}>
          {t('staff:openCheckIn')}
        </Link>
        <Link className="admin-secondary-action" to={`/staff/guests${query}`}>
          {t('staff:openGuests')}
        </Link>
        <Link className="admin-secondary-action" to={`/staff/history${query}`}>
          {t('staff:openHistory')}
        </Link>
      </nav>
    </article>
  );
}

export function StaffOverviewPage() {
  const { t } = useTranslation();
  return (
    <>
      <AdminPageHeader
        title={t('staff:overviewTitle')}
        description={t('staff:overviewDescription')}
      />
      <StaffAccessGate>
        {({ performances }) => {
          const { current, earlier } = splitEarlier(performances);
          return (
            <section className="staff-concert-list" aria-label={t('staff:overviewTitle')}>
              {current.map((entry) => (
                <PerformanceRow key={entry.id} performance={entry} />
              ))}
              {earlier.length ? (
                <details>
                  <summary>{t('staff:earlier')}</summary>
                  {earlier.map((entry) => (
                    <PerformanceRow key={entry.id} performance={entry} />
                  ))}
                </details>
              ) : null}
            </section>
          );
        }}
      </StaffAccessGate>
    </>
  );
}
