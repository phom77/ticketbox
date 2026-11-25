import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getDisruptionNotices, type DisruptionNotice } from '../../api/refundRequests';
import { dateFormatter } from '../../data/formatters';
import { useAuth } from '../../features/auth/AuthContext';
import { hasKeptTicket } from '../../features/refund/refundRequest';
import './RefundRequest.css';

const dateTime = dateFormatter({ dateStyle: 'full', timeStyle: 'short' });

/**
 * Postponed and cancelled events that affect the buyer's tickets, each linking to the options
 * page. A postponed event's banner goes away once the buyer chose Keep my ticket for the new date.
 */
export function DisruptionBanners({ concertId }: { concertId?: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [notices, setNotices] = useState<DisruptionNotice[]>([]);
  const userId = user?.id ?? '';

  useEffect(() => {
    const controller = new AbortController();
    getDisruptionNotices(controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) return;
        setNotices(
          loaded.filter(
            (notice) =>
              (!concertId || notice.concertId === concertId) &&
              !(
                notice.kind === 'POSTPONE' &&
                hasKeptTicket(window.localStorage, userId, notice.concertId, notice.newEventDate)
              ),
          ),
        );
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [concertId, userId]);

  if (notices.length === 0) return null;
  return (
    <div className="disruption-banners">
      {notices.map((notice) => (
        <section
          key={notice.concertId}
          className="disruption-banner"
          data-kind={notice.kind}
          aria-label={notice.concertTitle}
        >
          <span>
            <strong>
              {t(
                notice.kind === 'CANCEL'
                  ? 'customer:refundBanner_cancelled'
                  : 'customer:refundBanner_postponed',
                { event: notice.concertTitle },
              )}
            </strong>
            <small>
              {notice.kind === 'POSTPONE' && notice.newEventDate
                ? t('customer:refundBanner_newDate', {
                    date: dateTime.format(new Date(notice.newEventDate)),
                  })
                : t('customer:refundBanner_cancelledHelp')}
            </small>
          </span>
          <Link
            className="button button-primary"
            to={`/my-tickets/events/${encodeURIComponent(notice.concertId)}/options`}
          >
            {t('customer:refundBanner_options')}
          </Link>
        </section>
      ))}
    </div>
  );
}
