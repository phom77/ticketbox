import { ArrowRight, Ticket } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { BuyerState } from '../../components/feedback/BuyerState';
import { CardGridSkeleton } from '../../components/feedback/Skeleton';
import { EventCard, EventDateBlock } from '../../components/EventCard';
import { HeaderSearch } from '../../components/layout/HeaderSearch';
import { HorizontalRow } from '../../components/HorizontalRow';
import { RemoteImage } from '../../components/RemoteImage';
import { eventSaleLabels } from '../../features/concert/concertSale';
import { eventCard, homeRows } from '../../features/discovery/cards';
import {
  capitalize,
  catalogueKeys,
  currentMonthRange,
  writeDiscoveryFilters,
  type DiscoveryConcert,
} from '../../features/discovery/filters';
import {
  combineQuery,
  rememberSearchSplit,
  type HeaderSearchValues,
} from '../../features/discovery/headerSearch';
import { useDiscoveryCatalog } from '../../features/discovery/useDiscoveryCatalog';
import { useDiscoveryFacets } from '../../features/discovery/useDiscoveryFacets';
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
  const navigate = useNavigate();
  const facets = useDiscoveryFacets();
  const [now, setNow] = useState(Date.now);
  const { catalog, loadingFirst, failedPage, retry } = useDiscoveryCatalog('', 1, undefined, noop);
  const rows = useMemo(() => homeRows(catalog.concerts, now), [catalog.concerts, now]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  function search(values: HeaderSearchValues) {
    rememberSearchSplit({ what: values.what, where: values.where });
    const params = writeDiscoveryFilters(new URLSearchParams(), {
      q: combineQuery(values.what, values.where),
      date: values.date,
      from: values.from,
      to: values.to,
    });
    navigate({ pathname: '/events', search: params.toString(), hash: '#discover-concerts' });
  }

  const month = currentMonthRange(now);
  const quick: Array<{ id: string; label: string; params: Record<string, string> }> = [
    { id: 'tonight', label: t('public:discovery_tonight'), params: { date: 'today' } },
    { id: 'weekend', label: t('public:discovery_weekend'), params: { date: 'weekend' } },
    {
      id: 'month',
      label: t('public:discovery_thisMonth'),
      params: { date: 'custom', from: month.from, to: month.to },
    },
    ...facets.cities
      .slice(0, 3)
      .map((city) => ({ id: 'city-' + city, label: city, params: { city } })),
    ...facets.categories.slice(0, 3).map((category) => ({
      id: 'cat-' + category,
      label: capitalize(category),
      params: { category },
    })),
  ];
  const [lead, ...others] = rows.highlights;
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
      <section className="home-hero" aria-labelledby="discovery-title">
        <h1 id="discovery-title">{t('public:discovery_title')}</h1>
        <p>{t('public:discovery_subtitle')}</p>
        <div className="home-hero-search">
          <HeaderSearch
            initial={{ where: '', what: '', date: '', from: '', to: '' }}
            onSearch={search}
            onOpenEvent={(href) => navigate(href)}
          />
        </div>
        <nav className="home-chips" aria-label={t('public:discovery_quickFilters')}>
          <ul>
            {quick.map(({ id, label, params }) => (
              <li key={id}>
                <Link to={{ pathname: '/events', search: new URLSearchParams(params).toString() }}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </section>

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
        <section className="home-highlights" aria-label={t('public:discovery_highlights')}>
          <HighlightCard concert={lead} now={now} large />
          {others.slice(0, 4).map((concert) => (
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
