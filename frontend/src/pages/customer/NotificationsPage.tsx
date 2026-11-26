import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCheck, RefreshCw } from 'lucide-react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  getNotifications,
  isNotificationAccessDenied,
  markNotificationRead,
  type NotificationItem,
} from '../../api/notifications';
import type { PublicLayoutContext } from '../../components/layout/PublicLayout';
import { dateFormatter } from '../../data/formatters';
import { useAuth } from '../../features/auth/AuthContext';
import { groupByDay, notificationDestination } from '../../features/notification/inbox';
import './NotificationsPage.css';

const dateTime = dateFormatter({ dateStyle: 'medium', timeStyle: 'short' });
const noticesPerPage = 50;

type InboxPage = {
  items: NotificationItem[];
  nextPage: number | null;
};

const noticeLabels = new Map([
  ['PAYMENT_SUCCEEDED', 'notificationsPage_ticketConfirmation'],
  ['CONCERT_REMINDER', 'notificationsPage_eventReminder'],
  ['ORDER_REFUNDED', 'notificationsPage_orderRefunded'],
  ['EVENT_CANCELLED', 'notificationsPage_eventCancelled'],
  ['EVENT_POSTPONED', 'notificationsPage_eventPostponed'],
  ['TICKET_TRANSFER_OFFERED', 'notificationsPage_ticketTransfer'],
  ['TICKET_TRANSFER_ACCEPTED', 'notificationsPage_ticketTransfer'],
  ['TICKET_TRANSFER_DECLINED', 'notificationsPage_ticketTransfer'],
  ['TICKET_TRANSFER_CANCELLED', 'notificationsPage_ticketTransfer'],
  ['TICKET_TRANSFER_EXPIRED', 'notificationsPage_ticketTransfer'],
  ['REFUND_REQUEST_RECEIVED', 'notificationsPage_refundRequest'],
  ['REFUND_REQUEST_APPROVED', 'notificationsPage_refundRequest'],
  ['REFUND_REQUEST_REJECTED', 'notificationsPage_refundRequest'],
]);

export function NotificationsPage() {
  const { user, token } = useAuth();
  return user && token ? <NotificationsInbox key={user.id + ':' + token} /> : null;
}

function NotificationsInbox() {
  const { t } = useTranslation('customer');
  const { refreshUnreadNotifications, clearUnreadNotifications } =
    useOutletContext<PublicLayoutContext>();
  const [inbox, setInbox] = useState<InboxPage | null>(null);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [loadingPage, setLoadingPage] = useState<number | null>(0);
  const [failedPage, setFailedPage] = useState<number | 'denied' | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [markAllFailed, setMarkAllFailed] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [failedReads, setFailedReads] = useState<Set<string>>(new Set());
  const listRequest = useRef<AbortController>();
  const readRequest = useRef<AbortController>();
  const confirmedReads = useRef(new Map<string, string | null>());
  const focusAfterRead = useRef<HTMLElement[]>([]);
  const unreadFilter = useRef<HTMLButtonElement>(null);

  const clearInbox = useCallback(() => {
    listRequest.current?.abort();
    readRequest.current?.abort();
    readRequest.current = undefined;
    confirmedReads.current.clear();
    focusAfterRead.current = [];
    setInbox(null);
    setLoadingPage(null);
    setFailedPage('denied');
    setSavingId(null);
    setMarkingAll(false);
    setFailedReads(new Set());
    clearUnreadNotifications();
  }, [clearUnreadNotifications]);

  const loadPage = useCallback(
    async (number: number) => {
      if (listRequest.current && !listRequest.current.signal.aborted) return;
      const request = new AbortController();
      listRequest.current = request;
      setLoadingPage(number);
      setFailedPage(null);
      try {
        const page = await getNotifications(number, noticesPerPage, request.signal);
        if (request.signal.aborted) return;
        const appItems = page.content
          .filter((item) => item.channel === 'APP')
          .map((item) => {
            // A list request can finish after a later read has been confirmed.
            const knownReadAt = confirmedReads.current.get(item.id);
            return knownReadAt === undefined || item.read
              ? item
              : { ...item, read: true, readAt: knownReadAt };
          });
        setInbox((current) => {
          const items = new Map(
            (number === 0 ? [] : (current?.items ?? [])).map((item) => [item.id, item]),
          );
          for (const item of appItems) {
            const existing = items.get(item.id);
            items.set(item.id, existing?.read && !item.read ? existing : item);
          }
          return { items: [...items.values()], nextPage: page.last ? null : page.number + 1 };
        });
      } catch (error) {
        if (request.signal.aborted) return;
        if (isNotificationAccessDenied(error)) clearInbox();
        else setFailedPage(number);
      } finally {
        if (!request.signal.aborted) {
          listRequest.current = undefined;
          setLoadingPage(null);
        }
      }
    },
    [clearInbox],
  );

  useEffect(() => {
    void loadPage(0);
    return () => {
      listRequest.current?.abort();
      readRequest.current?.abort();
    };
  }, [loadPage]);

  useLayoutEffect(() => {
    if (focusAfterRead.current.length === 0) return;
    const target = focusAfterRead.current.find((article) => article.isConnected);
    focusAfterRead.current = [];
    (
      target?.querySelector<HTMLButtonElement>('.inbox-mark-read') ??
      target ??
      unreadFilter.current
    )?.focus();
  }, [inbox]);

  function refresh() {
    if (listRequest.current && !listRequest.current.signal.aborted) return;
    void loadPage(0);
    refreshUnreadNotifications();
  }

  async function markRead(item: NotificationItem, button: HTMLButtonElement) {
    if (readRequest.current || item.read) return;
    const request = new AbortController();
    readRequest.current = request;
    setSavingId(item.id);
    setFailedReads((current) => {
      if (!current.has(item.id)) return current;
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });

    try {
      const { data } = await markNotificationRead(item.id, request.signal);
      if (request.signal.aborted) return;
      if (data.read) {
        confirmedReads.current.set(item.id, data.readAt);
        const row = button.closest('li');
        if (row && document.activeElement === button) {
          focusAfterRead.current = [
            row,
            row.nextElementSibling,
            row.previousElementSibling,
          ].flatMap((element) => element?.querySelector<HTMLElement>('article') ?? []);
        }
      }
      setInbox(
        (current) =>
          current && {
            ...current,
            items: current.items.map((existing) => (existing.id === item.id ? data : existing)),
          },
      );
      refreshUnreadNotifications();
    } catch (error) {
      if (request.signal.aborted) return;
      if (isNotificationAccessDenied(error)) clearInbox();
      else setFailedReads((current) => new Set(current).add(item.id));
    } finally {
      if (!request.signal.aborted) {
        readRequest.current = undefined;
        setSavingId(null);
      }
    }
  }

  async function markAllRead() {
    if (readRequest.current || !inbox) return;
    const pending = inbox.items.filter((item) => !item.read);
    if (pending.length === 0) return;
    const request = new AbortController();
    readRequest.current = request;
    setMarkingAll(true);
    setMarkAllFailed(false);
    let failed = false;
    try {
      for (const item of pending) {
        try {
          const { data } = await markNotificationRead(item.id, request.signal);
          if (request.signal.aborted) return;
          if (data.read) {
            confirmedReads.current.set(item.id, data.readAt);
            setInbox(
              (current) =>
                current && {
                  ...current,
                  items: current.items.map((existing) =>
                    existing.id === item.id ? data : existing,
                  ),
                },
            );
          }
        } catch (error) {
          if (request.signal.aborted) return;
          if (isNotificationAccessDenied(error)) {
            clearInbox();
            return;
          }
          failed = true;
        }
      }
      setMarkAllFailed(failed);
      refreshUnreadNotifications();
    } finally {
      if (!request.signal.aborted) {
        readRequest.current = undefined;
        setMarkingAll(false);
      }
    }
  }

  const visibleItems = onlyUnread ? inbox?.items.filter((item) => !item.read) : inbox?.items;
  const loadFailure =
    failedPage === 'denied'
      ? 'notificationsPage_accessDenied'
      : inbox
        ? 'notificationsPage_refreshError'
        : 'notificationsPage_loadError';
  const olderFailure = typeof failedPage === 'number' && failedPage > 0;
  const nextPage = inbox?.nextPage ?? null;

  return (
    <section className="buyer-page page-width inbox-page" aria-labelledby="notifications-title">
      <header className="buyer-page-header">
        <h1 id="notifications-title">{t('customer:notificationsPage_heading')}</h1>
        {inbox ? (
          <div className="inbox-header-actions">
            {inbox.items.some((item) => !item.read) ? (
              <button
                className="button button-secondary"
                type="button"
                onClick={() => void markAllRead()}
                aria-disabled={markingAll || undefined}
              >
                <CheckCheck size={17} aria-hidden="true" />
                {t(
                  markingAll
                    ? 'customer:notificationsPage_markingAll'
                    : 'customer:notificationsPage_markAll',
                )}
              </button>
            ) : null}
            <button
              className="button button-secondary"
              type="button"
              onClick={refresh}
              aria-disabled={loadingPage !== null || undefined}
            >
              <RefreshCw
                size={17}
                aria-hidden="true"
                className={loadingPage === 0 ? 'spin' : undefined}
              />
              {t('customer:notificationsPage_refresh')}
            </button>
          </div>
        ) : null}
      </header>

      <div
        className="buyer-filters"
        role="group"
        aria-label={t('customer:notificationsPage_filters')}
      >
        <button type="button" aria-pressed={!onlyUnread} onClick={() => setOnlyUnread(false)}>
          {t('customer:notificationsPage_all')}
        </button>
        <button
          ref={unreadFilter}
          type="button"
          aria-pressed={onlyUnread}
          onClick={() => setOnlyUnread(true)}
        >
          {t('customer:notificationsPage_unread')}
        </button>
      </div>

      {failedPage === 0 || failedPage === 'denied' ? (
        <div className="inbox-feedback">
          <p role="alert">{t(loadFailure)}</p>
          <button className="button button-secondary" type="button" onClick={refresh}>
            {t('customer:notificationsPage_tryAgain')}
          </button>
        </div>
      ) : null}

      {inbox === null && loadingPage !== null ? (
        <div className="buyer-state" role="status">
          {t('customer:notificationsPage_loading')}
        </div>
      ) : null}

      {markAllFailed ? (
        <p className="inbox-read-error" role="alert">
          {t('customer:notificationsPage_markAllError')}
        </p>
      ) : null}

      {visibleItems?.length ? (
        <>
          {(() => {
            const groups = groupByDay(visibleItems, new Date());
            return (
              [
                ['today', groups.today],
                ['earlier', groups.earlier],
              ] as const
            ).map(([key, items]) =>
              items.length ? (
                <section key={key} className="inbox-group" aria-labelledby={`inbox-group-${key}`}>
                  <h2 id={`inbox-group-${key}`} className="inbox-group-title">
                    {t(
                      key === 'today'
                        ? 'customer:notificationsPage_today'
                        : 'customer:notificationsPage_earlier',
                    )}
                  </h2>
                  <ul
                    className="inbox-feed"
                    role="list"
                    aria-label={t('customer:notificationsPage_list')}
                  >
                    {items.map((item) => (
                      <li key={item.id}>
                        <NotificationCard
                          item={item}
                          failed={failedReads.has(item.id)}
                          saving={savingId === item.id}
                          locked={savingId !== null || markingAll}
                          onMarkRead={(button) => void markRead(item, button)}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null,
            );
          })()}
          <p className="inbox-preferences">
            {t('customer:notificationsPage_preferencesHint')}{' '}
            <Link to="/account/preferences">{t('customer:notificationsPage_preferencesLink')}</Link>
          </p>
        </>
      ) : inbox ? (
        <div className="buyer-state">
          <h2>
            {t(
              inbox.nextPage !== null
                ? 'notificationsPage_noMatches'
                : onlyUnread
                  ? 'notificationsPage_noUnread'
                  : 'notificationsPage_empty',
            )}
          </h2>
          {inbox.nextPage !== null && <p>{t('customer:notificationsPage_partialEmpty')}</p>}
        </div>
      ) : null}

      {nextPage !== null ? (
        <div className="inbox-pagination">
          {olderFailure && (
            <p className="inbox-read-error" role="alert">
              {t('customer:notificationsPage_olderError')}
            </p>
          )}
          <button
            className="button button-secondary"
            type="button"
            onClick={() => void loadPage(nextPage)}
            aria-disabled={loadingPage !== null || undefined}
          >
            {t(
              loadingPage !== null && loadingPage > 0
                ? 'notificationsPage_loadingOlder'
                : olderFailure
                  ? 'notificationsPage_tryAgain'
                  : 'notificationsPage_loadOlder',
            )}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function NotificationCard({
  item,
  failed,
  saving,
  locked,
  onMarkRead,
}: {
  item: NotificationItem;
  failed: boolean;
  saving: boolean;
  locked: boolean;
  onMarkRead: (button: HTMLButtonElement) => void;
}) {
  const { t } = useTranslation('customer');
  const typeLabel = t(noticeLabels.get(item.eventType) ?? 'notificationsPage_genericType');
  const subject = item.subject?.trim() ? item.subject : typeLabel;
  const action = notificationDestination(item.eventType);
  const headingId = useId();

  return (
    <article className="inbox-entry" tabIndex={-1} aria-labelledby={headingId}>
      <div className="inbox-content">
        <div className="inbox-meta">
          {subject !== typeLabel && <span>{typeLabel}</span>}
          <time dateTime={item.createdAt}>{dateTime.format(new Date(item.createdAt))}</time>
          <span className="inbox-read-state" data-unread={!item.read}>
            {t(item.read ? 'notificationsPage_read' : 'notificationsPage_unread')}
          </span>
        </div>
        <h3 id={headingId}>{subject}</h3>
        <p>{item.body}</p>
        {failed && (
          <p className="inbox-read-error" role="alert">
            {t('customer:notificationsPage_readError')}
          </p>
        )}
      </div>
      {(action || !item.read) && (
        <div className="inbox-actions">
          {action && (
            <Link className="button button-secondary" to={action.to}>
              {t(action.label)}
            </Link>
          )}
          {!item.read && (
            <button
              className="button inbox-mark-read"
              type="button"
              aria-describedby={headingId}
              aria-disabled={locked || undefined}
              onClick={(event) => onMarkRead(event.currentTarget)}
            >
              {t(
                saving
                  ? 'notificationsPage_markingRead'
                  : failed
                    ? 'notificationsPage_tryAgain'
                    : 'notificationsPage_markRead',
              )}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
