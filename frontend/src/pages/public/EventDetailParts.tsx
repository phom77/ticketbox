import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Minus, Plus } from 'lucide-react';
import DOMPurify from 'dompurify';
import { isRequestCanceled } from '../../api/client';
import { getDiscoveryEvents, getLayout, type Layout } from '../../api/performances';
import { EventCard } from '../../components/EventCard';
import { BuyerState } from '../../components/feedback/BuyerState';
import { concertSaleState } from '../../features/concert/concertSale';
import {
  canPurchase,
  groupByMonth,
  type DateSaleState,
  type DetailDate,
} from '../../features/event/eventDetail';
import type { DateInfo, TicketRow } from '../../features/event/useEventDetail';
import { AllInPriceNote, PriceFrom } from '../../features/price/AllInPrice';
import { formatPrice } from '../../features/price/price';
import { useCountdown } from '../../hooks/useCountdown';
import { formatLanguage } from '../../i18n';
import { formatInZone, stateLabels, zoneColor } from '../../features/event/eventFormat';

export function DateCards({
  dates,
  selectedId,
  states,
  infos,
  onSelect,
}: {
  dates: DetailDate[];
  selectedId: string | undefined;
  states: Record<string, DateSaleState>;
  infos: Record<string, DateInfo>;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation('event-detail');
  if (!dates.length) return <BuyerState tone="empty">{t('event-detail:datesEmpty')}</BuyerState>;
  const groups =
    dates.length > 6 ? groupByMonth(dates, formatLanguage()) : [{ key: 'all', label: '', dates }];
  return (
    <div className="ed-date-groups">
      {groups.map((group) => (
        <div key={group.key} role="group" aria-label={group.label || t('event-detail:datesTitle')}>
          {group.label ? <h3 className="ed-month">{group.label}</h3> : null}
          <ul className="ed-dates">
            {group.dates.map((date) => {
              const state = states[date.id];
              const info = infos[date.id];
              const selected = date.id === selectedId;
              return (
                <li key={date.id}>
                  <button
                    type="button"
                    className="ed-date"
                    aria-pressed={selected}
                    data-selected={selected || undefined}
                    data-state={state}
                    onClick={() => onSelect(date.id)}
                  >
                    <span className="ed-date-day">
                      {formatInZone(date.startsAt, date.timezone, 'day')}
                    </span>
                    <span className="ed-date-time">
                      {formatInZone(date.startsAt, date.timezone, 'time')}
                    </span>
                    <span className="ed-date-venue">{date.venueName}</span>
                    {info?.minPrice != null ? (
                      <PriceFrom amount={info.minPrice} className="ed-date-price" />
                    ) : null}
                    <span className="ed-chip" data-state={state}>
                      {state === 'upcoming'
                        ? t('event-detail:state_upcoming', {
                            time: formatInZone(date.saleStartAt, date.timezone, 'full'),
                          })
                        : t(stateLabels[state])}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function TicketList({
  rows,
  loading,
  failed,
  state,
  onRetry,
}: {
  rows: TicketRow[];
  loading: boolean;
  failed: boolean;
  state: DateSaleState;
  onRetry: () => void;
}) {
  const { t } = useTranslation('event-detail');
  if (loading) return <BuyerState tone="loading">{t('event-detail:ticketsLoading')}</BuyerState>;
  if (failed)
    return (
      <BuyerState
        tone="error"
        actions={
          <button type="button" className="button button-secondary" onClick={onRetry}>
            {t('event-detail:retry')}
          </button>
        }
      >
        {t('event-detail:ticketsFailed')}
      </BuyerState>
    );
  if (!rows.length) return <BuyerState tone="empty">{t('event-detail:ticketsEmpty')}</BuyerState>;
  const sellable = state === 'on-sale' || state === 'waiting-room' || state === 'upcoming';
  return (
    <>
      <ul className="ed-tickets">
        {rows.map((row) => {
          const label =
            row.available <= 0
              ? t('event-detail:soldOut')
              : !sellable
                ? t('event-detail:unavailable')
                : row.available <= 10
                  ? t('event-detail:fewLeft', { count: row.available })
                  : t('event-detail:available');
          const limit = row.maxPerAccount
            ? t('event-detail:limit', { count: row.maxPerAccount })
            : null;
          return (
            <li key={row.id} className="ed-ticket" data-soldout={row.available <= 0 || undefined}>
              <span
                className="ed-swatch"
                style={{ background: row.color ?? zoneColor(row.group ?? row.name) }}
                aria-hidden="true"
              />
              <div className="ed-ticket-body">
                <strong>{row.name}</strong>
                <span className="ed-muted">
                  {[row.group, label, limit].filter(Boolean).join(' · ')}
                </span>
              </div>
              <strong className="ed-ticket-price">{formatPrice(row.price)}</strong>
            </li>
          );
        })}
      </ul>
      <AllInPriceNote />
    </>
  );
}

/** Read-only overview of the performance layout, or the legacy sanitized SVG. */
export function VenueMap({ date, svg }: { date: DetailDate; svg: string | null }) {
  const { t } = useTranslation('event-detail');
  const [layout, setLayout] = useState<{ id: string; layout: Layout | null } | null>(null);
  const performanceId = svg || date.legacyConcertId ? undefined : date.id;
  useEffect(() => {
    if (!performanceId) return;
    const controller = new AbortController();
    getLayout(performanceId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setLayout({ id: performanceId, layout: value });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && !isRequestCanceled(error))
          setLayout({ id: performanceId, layout: null });
      });
    return () => controller.abort();
  }, [performanceId]);
  const clean = useMemo(
    () => (svg ? DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } }) : ''),
    [svg],
  );
  const current = layout && layout.id === performanceId ? layout.layout : null;
  if (!clean && !current?.sections.length) return null;
  const label = t('event-detail:mapLabel', { venue: date.venueName });
  return (
    <section className="ed-section" aria-labelledby="ed-map-title">
      <h2 id="ed-map-title">{t('event-detail:mapTitle')}</h2>
      {clean ? (
        <div
          className="ed-map"
          role="img"
          aria-label={label}
          dangerouslySetInnerHTML={{ __html: clean }}
        />
      ) : current ? (
        <div className="ed-map-layout">
          <svg
            className="ed-map"
            viewBox={`0 0 ${current.width} ${current.height}`}
            role="img"
            aria-label={label}
          >
            {current.backgroundUrl ? (
              <image
                href={current.backgroundUrl}
                width={current.width}
                height={current.height}
                opacity={0.35}
              />
            ) : null}
            {current.shapes.map((shape, index) => (
              <polygon
                key={index}
                className="ed-map-shape"
                points={shape.points.map((point) => point.x + ',' + point.y).join(' ')}
              />
            ))}
            {current.sections.map((section) => (
              <polygon
                key={section.id}
                points={section.points.map((point) => point.x + ',' + point.y).join(' ')}
                fill={zoneColor(section.label)}
                fillOpacity={0.55}
                stroke={zoneColor(section.label)}
                strokeWidth={2}
              />
            ))}
          </svg>
          <ul className="ed-legend" aria-label={t('event-detail:mapLegend')}>
            {current.sections.map((section) => (
              <li key={section.id}>
                <span
                  className="ed-swatch"
                  style={{ background: zoneColor(section.label) }}
                  aria-hidden="true"
                />
                <span>
                  <strong>{section.label}</strong>
                  <span className="ed-muted">
                    {' · '}
                    {section.kind === 'GA'
                      ? t('event-detail:mapKindGeneral')
                      : t('event-detail:mapKindAssigned')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="ed-muted">{t('event-detail:mapNote')}</p>
    </section>
  );
}

function OpensCountdown({ at }: { at: string }) {
  const { t } = useTranslation('event-detail');
  const countdown = useCountdown(at);
  if (countdown.isExpired || countdown.remainingMs <= 0 || countdown.remainingMs > 86_400_000)
    return null;
  return <p className="ed-muted">{t('event-detail:opensIn', { time: countdown.formatted })}</p>;
}

export type PanelRole = 'guest' | 'buyer' | 'staff' | 'loading';

export function TicketPanel({
  date,
  state,
  minPrice,
  role,
  preview,
  quantity,
  limit,
  onQuantity,
  purchasePath,
}: {
  date: DetailDate | undefined;
  state: DateSaleState;
  minPrice: number | null;
  role: PanelRole;
  preview: boolean;
  quantity: number;
  limit: number;
  onQuantity: (value: number) => void;
  purchasePath: string;
}) {
  const { t } = useTranslation('event-detail');
  const buyable = canPurchase(state) && !preview;
  const search = '?qty=' + quantity;
  const hints: Partial<Record<DateSaleState, string>> = {
    'sold-out': 'hintSoldOut',
    cancelled: 'hintCancelled',
    paused: 'hintPaused',
    closed: 'hintClosed',
  };
  const ctaLabels: Partial<Record<DateSaleState, string>> = {
    'sold-out': 'ctaSoldOut',
    cancelled: 'ctaCancelled',
    paused: 'ctaPaused',
    closed: 'ctaClosed',
  };
  let action;
  if (!date) action = null;
  else if (preview) action = null;
  else if (buyable && role === 'staff') action = null;
  else if (buyable && role === 'guest')
    action = (
      <Link
        className="button button-primary"
        to="/login"
        state={{ from: { pathname: purchasePath + '/waiting-room', search } }}
      >
        {t('event-detail:ctaSignIn')}
      </Link>
    );
  else if (buyable)
    action =
      role === 'loading' ? (
        <button type="button" className="button button-primary" disabled>
          {t('event-detail:ctaBuy')}
        </button>
      ) : (
        <Link className="button button-primary" to={purchasePath + '/waiting-room' + search}>
          {t(state === 'waiting-room' ? 'ctaWaitingRoom' : 'ctaBuy')}
        </Link>
      );
  else if (state === 'upcoming')
    action = (
      <button type="button" className="button button-secondary" disabled>
        {t('event-detail:ctaOpens', {
          time: formatInZone(date.saleStartAt, date.timezone, 'full'),
        })}
      </button>
    );
  else
    action = (
      <button type="button" className="button button-secondary" disabled>
        {t(ctaLabels[state] ?? 'ctaClosed')}
      </button>
    );

  return (
    <aside className="ed-panel" aria-labelledby="ed-panel-title">
      <h2 id="ed-panel-title">{t('event-detail:panelTitle')}</h2>
      {date ? (
        <p className="ed-panel-date">
          <strong>{formatInZone(date.startsAt, date.timezone, 'full')}</strong>
          <span className="ed-muted">{date.venueName}</span>
        </p>
      ) : null}
      <p className="ed-chip" data-state={state} role="status">
        {state === 'upcoming' && date
          ? t('event-detail:state_upcoming', {
              time: formatInZone(date.saleStartAt, date.timezone, 'full'),
            })
          : t(stateLabels[state])}
      </p>
      {state === 'upcoming' && date ? <OpensCountdown at={date.saleStartAt} /> : null}
      {minPrice != null ? (
        <div className="ed-panel-price">
          <PriceFrom amount={minPrice} />
          <AllInPriceNote />
        </div>
      ) : null}
      {buyable && role !== 'staff' ? (
        <div className="ed-qty">
          <span id="ed-qty-label">{t('event-detail:quantity')}</span>
          <div className="ed-qty-controls" role="group" aria-labelledby="ed-qty-label">
            <button
              type="button"
              className="ed-qty-button"
              aria-label={t('event-detail:quantityDecrease')}
              disabled={quantity <= 1}
              onClick={() => onQuantity(quantity - 1)}
            >
              <Minus size={18} aria-hidden="true" />
            </button>
            <output aria-live="polite">{quantity}</output>
            <button
              type="button"
              className="ed-qty-button"
              aria-label={t('event-detail:quantityIncrease')}
              disabled={quantity >= limit}
              onClick={() => onQuantity(quantity + 1)}
            >
              <Plus size={18} aria-hidden="true" />
            </button>
          </div>
          <span className="ed-muted">{t('event-detail:quantityLimit', { count: limit })}</span>
        </div>
      ) : null}
      {action}
      {preview ? <p className="ed-muted">{t('event-detail:previewPanel')}</p> : null}
      {buyable && role === 'guest' ? (
        <p className="ed-muted">{t('event-detail:signInHint')}</p>
      ) : null}
      {buyable && role === 'staff' ? (
        <p className="ed-muted">{t('event-detail:staffNotice')}</p>
      ) : null}
      {!buyable && !preview && hints[state] ? <p className="ed-muted">{t(hints[state]!)}</p> : null}
    </aside>
  );
}

export function RelatedEvents({ excludeIds }: { excludeIds: string[] }) {
  const { t } = useTranslation('event-detail');
  const [items, setItems] = useState<
    Awaited<ReturnType<typeof getDiscoveryEvents>>['content'] | null
  >(null);
  const key = excludeIds.join(',');
  useEffect(() => {
    const controller = new AbortController();
    getDiscoveryEvents('', 0, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) setItems(page.content);
      })
      .catch(() => {
        if (!controller.signal.aborted) setItems([]);
      });
    return () => controller.abort();
  }, [key]);
  const now = Date.now();
  const related = (items ?? [])
    .filter((item) => !excludeIds.includes(item.id) && !excludeIds.includes(item.eventId ?? ''))
    .filter((item) => ['on-sale', 'upcoming', 'waiting-room'].includes(concertSaleState(item, now)))
    .slice(0, 3);
  if (items && !related.length) return null;
  return (
    <section className="ed-section" aria-labelledby="ed-related-title">
      <h2 id="ed-related-title">{t('event-detail:relatedTitle')}</h2>
      {items ? (
        <div className="event-grid event-grid-three">
          {related.map((item) => (
            <EventCard
              key={item.id}
              event={{
                id: item.id,
                title: item.title,
                venue: item.venueName,
                href: item.eventId
                  ? '/events/' +
                    encodeURIComponent(item.eventId) +
                    '?performance=' +
                    encodeURIComponent(item.id)
                  : '/events/' + encodeURIComponent(item.id),
                eventDate: item.eventDate,
                status: concertSaleState(item, now),
                image: item.posterUrl,
              }}
            />
          ))}
        </div>
      ) : (
        <BuyerState tone="loading">{t('event-detail:relatedLoading')}</BuyerState>
      )}
    </section>
  );
}
