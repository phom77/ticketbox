import { ArrowRight, Ticket } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { BuyerState } from '../../components/feedback/BuyerState';
import { CardGridSkeleton } from '../../components/feedback/Skeleton';
import { EventCard, EventDateBlock } from '../../components/EventCard';
import { HorizontalRow } from '../../components/HorizontalRow';
import { RemoteImage } from '../../components/RemoteImage';
import { eventSaleLabels } from '../../features/concert/concertSale';
import { eventCard, homeRows } from '../../features/discovery/cards';
import { catalogueKeys, type DiscoveryConcert } from '../../features/discovery/filters';
import { useDiscoveryCatalog } from '../../features/discovery/useDiscoveryCatalog';
import './HomePage.css';

export function HomePage() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  if (catalogueKeys.some((key) => params.get(key))) {
    return (
      <Navigate
        replace
        to={{ pathname: '/events', search: location.search, hash: location.hash }}
      />
    );
  }
  return <DiscoveryHome />;
}

const noop = () => undefined;

function HighlightCard({
  concert,
  now,
  large,
}: {
  concert: DiscoveryConcert;
  now: number;
  large: boolean;
}) {
  const { t } = useTranslation('public');
  const card = eventCard(concert, now);
  return (
    <Link className="home-highlight" data-large={large ? 'true' : undefined} to={card.href}>
      <span className="home-highlight-media">
        {card.image ? (
          <RemoteImage
            src={card.image}
            alt=""
            width={large ? 960 : 480}
            height={large ? 540 : 270}
            loading={large ? 'eager' : 'lazy'}
          />
        ) : (
          <Ticket aria-hidden="true" />
        )}
      </span>
      <span className="home-highlight-body">
        <span className="concert-card-status" data-sale-state={card.status}>
          {t(eventSaleLabels[card.status])}
        </span>
        <EventDateBlock value={card.eventDate} />
        <strong>{card.title}</strong>
        <span className="home-highlight-place">
          {[card.venue, card.city].filter(Boolean).join(' · ')}
        </span>
      </span>
    </Link>
  );
}

function DiscoveryHome() {
  const { t } = useTranslation('public');
  const [now, setNow] = useState(Date.now);
  const { catalog, loadingFirst, failedPage, retry } = useDiscoveryCatalog('', 1, undefined, noop);
  const rows = useMemo(() => homeRows(catalog.concerts, now), [catalog.concerts, now]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const [lead, ...others] = rows.highlights;
  // Four tiles make a 2 × 2 block beside the lead; fewer stack in one column.
  const tiles = others.length >= 4 ? others.slice(0, 4) : others.slice(0, 2);
  const empty = !loadingFirst && failedPage === null && catalog.concerts.length === 0;

  function renderRow(title: string, concerts: DiscoveryConcert[], badges = false) {
    if (concerts.length === 0) return null;
    return (
      <HorizontalRow
        title={title}
        action={
          <Link className="home-row-link" to="/events">
            {t('public:discovery_seeAll')}
          </Link>
        }
      >
        {concerts.slice(0, 12).map((concert) => (
          <EventCard
            key={concert.id}
            event={eventCard(concert, now, badges)}
            action={t('public:discovery_findTickets')}
            linkId={`home-event-${concert.id}`}
          />
        ))}
      </HorizontalRow>
    );
  }

  return (
    <div className="buyer-page discovery-page home-page page-width">
      <header className="home-hero">
        <h1 id="discovery-title">{t('public:discovery_title')}</h1>
        <p>{t('public:discovery_subtitle')}</p>
      </header>

      {loadingFirst ? <CardGridSkeleton count={4} label={t('public:discovery_loading')} /> : null}
      {failedPage !== null ? (
        <BuyerState
          tone="error"
          actions={
            <button type="button" className="button button-secondary" onClick={retry}>
              {t('public:discovery_tryAgain')}
            </button>
          }
        >
          {t('public:discovery_loadError')}
        </BuyerState>
      ) : null}
      {empty ? (
        <BuyerState tone="empty" headingLevel={2} title={t('public:discovery_noEvents')}>
          {t('public:discovery_returnLater')}
        </BuyerState>
      ) : null}

      {lead ? (
        <section
          className="home-highlights"
          data-tiles={tiles.length}
          aria-label={t('public:discovery_highlights')}
        >
          <HighlightCard concert={lead} now={now} large />
          {tiles.map((concert) => (
            <HighlightCard key={concert.id} concert={concert} now={now} large={false} />
          ))}
        </section>
      ) : null}

      {renderRow(t('public:discovery_thisWeek'), rows.thisWeek, true)}
      {renderRow(t('public:discovery_onSaleNow'), rows.onSale)}
      {renderRow(t('public:discovery_comingSoon'), rows.comingSoon)}

      {catalog.concerts.length > 0 ? (
        <p className="home-browse">
          <Link className="button button-primary" to="/events">
            {t('public:discovery_browseAll')}
            <ArrowRight aria-hidden="true" />
          </Link>
        </p>
      ) : null}
    </div>
  );
}
