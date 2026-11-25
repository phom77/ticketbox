import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, CalendarPlus, Clock, MapPin, Share2 } from 'lucide-react';
import { RemoteImage } from '../../components/RemoteImage';
import { BuyerInformationLinks } from '../../components/BuyerInformationLinks';
import { BuyerState } from '../../components/feedback/BuyerState';
import { DetailSkeleton } from '../../components/feedback/Skeleton';
import { useAuth } from '../../features/auth/AuthContext';
import { waitingRoomLeadMs } from '../../features/concert/concertSale';
import { categoryText } from '../../features/discovery/categories';
import { downloadIcs } from '../../features/event/calendar';
import {
  canPurchase,
  clampQuantity,
  datePurchasePath,
  dateSaleState,
  mapsUrl,
  quantityLimit,
  type DateSaleState,
} from '../../features/event/eventDetail';
import { formatInZone } from '../../features/event/eventFormat';
import { useDateInfos, useEventDetail, useTicketRows } from '../../features/event/useEventDetail';
import { useOrganization } from '../../features/organizations/OrganizationProvider';
import { lowestPrice } from '../../features/price/price';
import {
  DateCards,
  RelatedEvents,
  TicketList,
  TicketPanel,
  VenueMap,
  type PanelRole,
} from './EventDetailParts';
import './ConcertDetailPage.css';
import './EventDetail.css';

export function EventDetailPage({ preview = false }: { preview?: boolean }) {
  const { eventId, id } = useParams();
  const organization = useOrganization();
  const organizationId = preview ? organization?.selected?.id : null;
  const key = eventId ?? id;
  return key ? (
    <EventDetailView key={JSON.stringify([key, organizationId])} id={key} preview={preview} />
  ) : null;
}

function EventDetailView({ id, preview }: { id: string; preview: boolean }) {
  const { t } = useTranslation('event-detail');
  const { user, loading: loadingUser } = useAuth();
  const [params, setParams] = useSearchParams();
  const { source, error, retry } = useEventDetail(id, preview);
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState('');

  const dates = useMemo(() => source?.dates ?? [], [source]);
  const infos = useDateInfos(source, preview);

  const requested = params.get('performance');
  const selectedDate = useMemo(() => {
    const exact = dates.find((date) => date.id === requested);
    if (exact) return exact;
    const upcoming = dates.filter((date) => Date.parse(date.endsAt ?? date.startsAt) > now);
    return (
      upcoming.find((date) => canPurchase(dateSaleState(date, now, infos[date.id]?.soldOut))) ??
      upcoming[0] ??
      dates[0]
    );
  }, [dates, requested, now, infos]);

  const live = useTicketRows(source, selectedDate, preview);

  // Re-evaluate sale state at the next sale boundary.
  useEffect(() => {
    const next = dates
      .flatMap((date) => [
        Date.parse(date.saleStartAt) - waitingRoomLeadMs,
        Date.parse(date.saleStartAt),
        date.saleEndAt ? Date.parse(date.saleEndAt) : NaN,
      ])
      .filter((time) => time > now)
      .sort((a, b) => a - b)[0];
    if (!next) return;
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.min(Math.max(0, next - Date.now()), 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [dates, now]);

  const states = useMemo(() => {
    const result: Record<string, DateSaleState> = {};
    for (const date of dates) {
      const soldOut = date.id === selectedDate?.id ? live.soldOut : infos[date.id]?.soldOut;
      result[date.id] = dateSaleState(date, now, soldOut);
    }
    return result;
  }, [dates, now, infos, selectedDate, live.soldOut]);

  const select = useCallback(
    (dateId: string) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set('performance', dateId);
          next.delete('qty');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const limit = quantityLimit(
    selectedDate?.maxPerAccount ??
      (live.rows.length ? Math.max(...live.rows.map((row) => row.maxPerAccount ?? 0)) : null),
  );
  const quantity = clampQuantity(params.get('qty'), limit);
  const setQuantity = (value: number) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('qty', String(clampQuantity(value, limit)));
        return next;
      },
      { replace: true },
    );

  const returnPath = preview ? '/organizer/concerts/' + encodeURIComponent(id) : '/events';
  if (error)
    return (
      <div className="buyer-page page-width ed-page">
        <BuyerState
          tone="error"
          headingLevel={1}
          title={t(error === 'unavailable' ? 'unavailableTitle' : 'loadFailedTitle')}
          actions={
            <>
              {error === 'temporary' ? (
                <button type="button" className="button button-primary" onClick={retry}>
                  {t('event-detail:retry')}
                </button>
              ) : null}
              <Link className="button button-secondary" to={returnPath}>
                {t(preview ? 'backPreview' : 'back')}
              </Link>
            </>
          }
        >
          {t(error === 'unavailable' ? 'unavailableBody' : 'loadFailedBody')}
        </BuyerState>
      </div>
    );
  if (!source)
    return (
      <div className="buyer-page page-width ed-page">
        <DetailSkeleton label={t('event-detail:loading')} />
      </div>
    );

  const state: DateSaleState = selectedDate ? states[selectedDate.id] : 'closed';
  const role: PanelRole = loadingUser
    ? 'loading'
    : !user
      ? 'guest'
      : user.role === 'AUDIENCE'
        ? 'buyer'
        : 'staff';
  const prices = live.rows.filter((row) => row.available > 0).map((row) => row.price);
  const minPrice =
    lowestPrice(prices.length ? prices : selectedDate ? [infos[selectedDate.id]?.minPrice] : []) ??
    lowestPrice(live.rows.map((row) => row.price));
  const eventUrl = window.location.origin + '/events/' + encodeURIComponent(id);
  const shareUrl =
    selectedDate && dates.length > 1
      ? eventUrl + '?performance=' + encodeURIComponent(selectedDate.id)
      : eventUrl;
  const nextDate = dates.find((date) => Date.parse(date.endsAt ?? date.startsAt) > now) ?? dates[0];
  const heroDate = selectedDate ?? nextDate;
  const purchasePath = selectedDate ? datePurchasePath(source.eventId, selectedDate) : '';

  async function share() {
    const data = { title: source!.title, url: shareUrl };
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share(data);
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setNotice(t('event-detail:linkCopied'));
    } catch (failure) {
      if (failure instanceof DOMException && failure.name === 'AbortError') return;
      setNotice(t('event-detail:copyFailed'));
    }
  }

  return (
    <div className="buyer-page page-width ed-page" data-preview={preview || undefined}>
      <Link className="concert-purchase-back" to={returnPath}>
        <ArrowLeft size={17} aria-hidden="true" /> {t(preview ? 'backPreview' : 'back')}
      </Link>
      {preview ? (
        <p className="buyer-state" data-tone="info">
          {t('event-detail:previewBanner')}
        </p>
      ) : null}

      <header className="ed-hero">
        {source.posterUrl ? (
          <RemoteImage
            className="ed-poster"
            src={source.posterUrl}
            alt=""
            width={384}
            height={432}
          />
        ) : null}
        <div className="ed-hero-body">
          {source.category ? (
            <p className="ed-category">{categoryText(source.category, t)}</p>
          ) : null}
          <h1>{source.title}</h1>
          {source.organizer ? (
            <p className="ed-muted">{t('event-detail:organizer', { name: source.organizer })}</p>
          ) : null}
          {heroDate ? (
            <ul className="ed-facts">
              <li>
                <CalendarDays size={19} aria-hidden="true" />
                <span>
                  <span className="ed-muted">{t('event-detail:nextDate')}</span>{' '}
                  <time dateTime={heroDate.startsAt}>
                    {formatInZone(heroDate.startsAt, heroDate.timezone, 'full')}
                  </time>
                </span>
              </li>
              <li>
                <MapPin size={19} aria-hidden="true" />
                <span>
                  {heroDate.venueName}
                  {heroDate.venueAddress ? <small>{heroDate.venueAddress}</small> : null}
                  <a
                    href={mapsUrl(heroDate.venueName, heroDate.venueAddress)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('event-detail:viewMap')}
                  </a>
                </span>
              </li>
              {heroDate.doorsOpenAt ? (
                <li>
                  <Clock size={19} aria-hidden="true" />
                  <span>
                    {t('event-detail:doors', {
                      time: formatInZone(heroDate.doorsOpenAt, heroDate.timezone, 'time'),
                    })}
                  </span>
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="ed-muted">{t('event-detail:dateTba')}</p>
          )}
          <div className="ed-actions">
            <button type="button" className="button button-secondary" onClick={() => void share()}>
              <Share2 size={17} aria-hidden="true" /> {t('event-detail:share')}
            </button>
            {selectedDate ? (
              <button
                type="button"
                className="button button-secondary"
                onClick={() =>
                  downloadIcs(
                    {
                      uid: selectedDate.id,
                      title: source.title,
                      startsAt: selectedDate.startsAt,
                      endsAt: selectedDate.endsAt,
                      location: [selectedDate.venueName, selectedDate.venueAddress]
                        .filter(Boolean)
                        .join(', '),
                      description: t('event-detail:calendarDescription', { url: shareUrl }),
                      url: shareUrl,
                    },
                    'ticketbox-event.ics',
                  )
                }
              >
                <CalendarPlus size={17} aria-hidden="true" /> {t('event-detail:addToCalendar')}
              </button>
            ) : null}
            <span className="ed-muted" role="status">
              {notice}
            </span>
          </div>
        </div>
      </header>

      <div className="ed-layout">
        <div className="ed-main">
          <section className="ed-section" aria-labelledby="ed-dates-title">
            <h2 id="ed-dates-title">{t('event-detail:datesTitle')}</h2>
            <DateCards
              dates={dates}
              selectedId={selectedDate?.id}
              states={states}
              infos={infos}
              onSelect={select}
            />
          </section>

          {selectedDate ? (
            <section className="ed-section" aria-labelledby="ed-tickets-title">
              <h2 id="ed-tickets-title">{t('event-detail:ticketsTitle')}</h2>
              <TicketList
                rows={live.rows}
                loading={live.loading}
                failed={live.failed}
                state={state}
                onRetry={live.retry}
              />
            </section>
          ) : null}

          {selectedDate ? (
            <VenueMap key={selectedDate.id} date={selectedDate} svg={source.seatMapSvg} />
          ) : null}

          {source.description ? (
            <details className="ed-section ed-collapse" open>
              <summary>
                <h2>{t('event-detail:aboutTitle')}</h2>
              </summary>
              <p className="ed-prose">{source.description}</p>
            </details>
          ) : null}
          {source.artistBio ? (
            <details className="ed-section ed-collapse" open>
              <summary>
                <h2>{t('event-detail:artistTitle')}</h2>
              </summary>
              <p className="ed-prose">{source.artistBio}</p>
            </details>
          ) : null}

          {selectedDate ? (
            <section className="ed-section" aria-labelledby="ed-info-title">
              <h2 id="ed-info-title">{t('event-detail:infoTitle')}</h2>
              <dl className="ed-info">
                {selectedDate.doorsOpenAt ? (
                  <div>
                    <dt>{t('event-detail:infoDoors')}</dt>
                    <dd>{formatInZone(selectedDate.doorsOpenAt, selectedDate.timezone, 'time')}</dd>
                  </div>
                ) : null}
                {selectedDate.spaceName ? (
                  <div>
                    <dt>{t('event-detail:infoSpace')}</dt>
                    <dd>{selectedDate.spaceName}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>{t('event-detail:infoSaleStart')}</dt>
                  <dd>{formatInZone(selectedDate.saleStartAt, selectedDate.timezone, 'full')}</dd>
                </div>
                {selectedDate.saleEndAt ? (
                  <div>
                    <dt>{t('event-detail:infoSaleEnd')}</dt>
                    <dd>{formatInZone(selectedDate.saleEndAt, selectedDate.timezone, 'full')}</dd>
                  </div>
                ) : null}
                {selectedDate.maxPerAccount ? (
                  <div>
                    <dt>{t('event-detail:infoLimit')}</dt>
                    <dd>
                      {t('event-detail:infoLimitValue', { count: selectedDate.maxPerAccount })}
                    </dd>
                  </div>
                ) : null}
                {source.organizer ? (
                  <div>
                    <dt>{t('event-detail:infoOrganizer')}</dt>
                    <dd>{source.organizer}</dd>
                  </div>
                ) : null}
              </dl>
              {!preview ? <BuyerInformationLinks /> : null}
            </section>
          ) : null}

          {!preview ? (
            <RelatedEvents
              excludeIds={[
                id,
                ...(source.eventId ? [source.eventId] : []),
                ...dates.map((date) => date.id),
              ]}
            />
          ) : null}
        </div>

        <TicketPanel
          date={selectedDate}
          state={state}
          minPrice={minPrice}
          role={role}
          preview={preview}
          quantity={quantity}
          limit={limit}
          onQuantity={setQuantity}
          purchasePath={purchasePath}
        />
      </div>
    </div>
  );
}
