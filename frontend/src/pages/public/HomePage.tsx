import { ArrowRight, Search, Ticket, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { eventPath } from '../../api/performances';
import { EventCard, type EventCardItem } from '../../components/EventCard';
import { RemoteImage } from '../../components/RemoteImage';
import { currency, dateFormatter } from '../../data/formatters';
import { eventSaleLabels } from '../../features/concert/concertSale';
import { concertTitle } from '../../features/concert/concertText';
import { DiscoveryFilterPanel, DiscoveryFilterTrigger } from '../../features/discovery/DiscoveryFilterPanel';
import {
  concertTimeZone, discoveryOptions, discoverySaleState, filterConcerts, readDiscoveryFilters, sortOptions, writeDiscoveryFilters,
  type DiscoveryConcert, type DiscoveryFilters,
} from '../../features/discovery/filters';
import { useDiscoveryCatalog, type DiscoveryCatalog } from '../../features/discovery/useDiscoveryCatalog';
import './HomePage.css';

const dateLabel = dateFormatter({ dateStyle: 'medium', timeStyle: 'short', timeZone: concertTimeZone });
const filterDateLabel = dateFormatter({ dateStyle: 'medium', timeZone: 'UTC' });
const resetFilters = { q: '', date: '', from: '', to: '', status: '', city: '', category: '', price: '' } as const;
const chipKeys = ['date', 'status', 'city', 'category', 'price'] as const;
const catalogueKeys = ['q', 'date', 'from', 'to', 'status', 'sort'] as const;

type BackSnapshot = {
  key: string;
  catalog: DiscoveryCatalog;
  linkId: string;
  linkTop: number;
  scrollTop: number;
};

const recentLists = new Map<string, BackSnapshot>();

function eventCard(concert: DiscoveryConcert, now: number): EventCardItem & { href: string } {
  return {
    id: concert.id, title: concertTitle(concert), venue: concert.venueName,
    href: concert.performance
      ? `${eventPath(concert.performance.eventId)}?performance=${encodeURIComponent(concert.id)}`
      : `/concerts/${encodeURIComponent(concert.id)}`,
    eventDate: concert.eventDate, image: concert.posterUrl, status: discoverySaleState(concert, now),
  };
}

export function HomePage({ previewConcerts }: { previewConcerts?: DiscoveryConcert[] }) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  if (!previewConcerts && catalogueKeys.some((key) => params.get(key))) {
    return <Navigate replace to={{ pathname: '/events', search: location.search, hash: location.hash }} />;
  }
  return <DiscoveryPage previewConcerts={previewConcerts} />;
}

export function EventCataloguePage() {
  const { search } = useLocation();
  return <DiscoveryPage key={search} catalogue />;
}

function DiscoveryPage({ catalogue = false, previewConcerts }: {
  catalogue?: boolean;
  previewConcerts?: DiscoveryConcert[];
}) {
  const { t } = useTranslation('public');
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const params = new URLSearchParams(location.search);
  const isPreview = Boolean(previewConcerts);
  const isHome = !catalogue && !isPreview;
  const filters = readDiscoveryFilters(params, isPreview);
  const catalogSearch = new URLSearchParams();
  if (catalogue) {
    for (const key of catalogueKeys) {
      if (filters[key]) catalogSearch.set(key, filters[key]);
    }
  }
  const [restored] = useState(() =>
    !isPreview && navigationType === 'POP' ? recentLists.get(location.key) : undefined,
  );
  const { catalog, requestedPage, failedPage, loadMore } =
    useDiscoveryCatalog(catalogSearch.toString(), restored?.catalog, !isPreview);
  const [now, setNow] = useState(Date.now);
  const heading = useRef<HTMLHeadingElement>(null);
  const isInitialLoading = requestedPage === 0;
  const matches = previewConcerts ? filterConcerts(previewConcerts, filters, now) : catalog.concerts;
  const hasFilters = Boolean(filters.q || chipKeys.some((key) => filters[key]));
  const onSale = isHome ? matches.filter((concert) => discoverySaleState(concert, now) === 'on-sale') : [];
  const featureConcert = isHome && matches.length > 1
    ? onSale.find((concert) => concert.posterUrl) ?? matches.find((concert) => concert.posterUrl)
    : undefined;
  const feature = featureConcert ? eventCard(featureConcert, now) : null;
  const homeOnSale = onSale.filter((concert) => concert.id !== feature?.id).slice(0, 4);
  const homeOther = isHome ? matches.filter((concert) =>
    concert.id !== feature?.id && discoverySaleState(concert, now) !== 'on-sale').slice(0, 4) : [];
  const resultsTitle = t(hasFilters ? 'public:discovery_results' : 'public:discovery_upcomingEvents');

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useLayoutEffect(() => {
    if (!restored) return;
    const frame = requestAnimationFrame(() => {
      const link = document.getElementById(restored.linkId);
      const top = link ? window.scrollY + link.getBoundingClientRect().top - restored.linkTop : restored.scrollTop;
      window.scrollTo({ top, behavior: 'instant' });
      link?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [restored]);

  useEffect(() => {
    if (isInitialLoading || location.hash !== '#discover-concerts' || restored?.key === location.key) return;
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement;
      if (navigationType === 'POP' && active !== document.body && active !== heading.current) return;
      heading.current?.scrollIntoView({ behavior: 'instant', block: 'start' });
      heading.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [isInitialLoading, location.hash, location.key, navigationType, restored]);

  function savePosition(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey || event.defaultPrevented) return;
    recentLists.delete(location.key);
    recentLists.set(location.key, {
      key: location.key,
      catalog,
      linkId: event.currentTarget.id,
      linkTop: event.currentTarget.getBoundingClientRect().top,
      scrollTop: window.scrollY,
    });
    if (recentLists.size > 5) {
      const oldest = recentLists.keys().next().value;
      if (oldest !== undefined) recentLists.delete(oldest);
    }
  }

  function applyFilters(next: Partial<DiscoveryFilters>) {
    navigate({ search: writeDiscoveryFilters(params, next).toString(), hash: '#discover-concerts' });
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    applyFilters({ q: String(data.get('q') ?? '').trim() });
  }

  const customDates = filters.date === 'custom' ? [
    filters.from && filterDateLabel.format(new Date(filters.from)),
    filters.to && filterDateLabel.format(new Date(filters.to)),
  ] : [];
  const dateChipLabel = customDates.length ? (
    customDates[0] && customDates[1]
      ? t('public:discovery_range', { from: customDates[0], to: customDates[1] })
      : customDates[0] ? t('public:discovery_fromDate', { date: customDates[0] }) : t('public:discovery_toDate', { date: customDates[1] })
  ) : '';
  const chips = [
    ...(filters.q ? [{ key: 'q', label: filters.q, clear: { q: '' } as const }] : []),
    ...chipKeys.filter((key) => filters[key]).map((key) => ({
      key,
      label: key === 'date' && dateChipLabel ? dateChipLabel
        : t((discoveryOptions[key] as Record<string, string>)[filters[key]]),
      clear: key === 'date' ? { date: '', from: '', to: '' } as const : { [key]: '' },
    })),
  ];
  const filterCount = chips.filter(({ key }) => key !== 'q').length;

  function renderEventGrid(events: DiscoveryConcert[]) {
    return (
      <div className="discovery-grid">
        {events.map((concert, index) => {
          const card = eventCard(concert, now);
          return <EventCard
            key={concert.id}
            event={{
              ...card,
              supportingText: isPreview && concert.price !== undefined
                ? [concert.city && t(discoveryOptions.city[concert.city]),
                  concert.category && t(discoveryOptions.category[concert.category]),
                  currency.format(concert.price)].filter(Boolean).join(' · ')
                : undefined,
            }}
            priority={index < 2 && !feature}
            preview={isPreview}
            action={card.status === 'on-sale' ? t('public:discovery_findTickets') : t('public:discovery_viewEvent')}
            heading={catalogue ? 'h2' : 'h3'}
            linkId={`discovery-event-${concert.id}`}
            onOpen={savePosition}
          />;
        })}
      </div>
    );
  }

  return (
    <div className="buyer-page discovery-page page-width" data-discovery-restore={restored ? true : undefined}>
      {!catalogue ? <section className="discovery-intro" aria-labelledby="discovery-title">
        <div className="discovery-main">
          <h1 id="discovery-title">{t('public:discovery_title')}</h1>
          {isHome ? <Link className="button button-primary discovery-browse" to="/events">
            {t('public:discovery_browseAll')}
          </Link> : null}
          {isPreview ? <form className="discovery-search" role="search" aria-label={t('public:discovery_search')} onSubmit={submitSearch}>
            <div className="discovery-search-input">
              <Search aria-hidden="true" />
              <input
                key={filters.q}
                type="search"
                name="q"
                aria-label={t('public:discovery_search')}
                placeholder={t('public:discovery_searchPlaceholder')}
                defaultValue={filters.q}
              />
            </div>
            <button className="button button-primary" type="submit">{t('public:discovery_searchSubmit')}</button>
          </form> : null}
          {isPreview ? <p className="discovery-preview-label">{t('public:discovery_fixtureLabel')}</p> : null}
        </div>

        {feature ? (
          <aside className="discovery-feature" aria-label={t('public:discovery_featuredEvent')}>
            <div className="discovery-feature-media">
              {feature.image ? <RemoteImage src={feature.image} alt="" width="640" height="400" /> : <Ticket aria-hidden="true" />}
            </div>
            <div className="discovery-feature-body">
              <span className="concert-card-status" data-sale-state={feature.status}>{t(eventSaleLabels[feature.status])}</span>
              <h2>{feature.title}</h2>
              {Number.isFinite(Date.parse(feature.eventDate)) ? <time dateTime={feature.eventDate}>{dateLabel.format(new Date(feature.eventDate))}</time> : null}
              {feature.venue ? <p>{feature.venue}</p> : null}
              <Link className="discovery-feature-link" id="discovery-feature-link" onClick={savePosition} to={feature.href}>
                {t(feature.status === 'on-sale' ? 'public:discovery_findTickets' : 'public:discovery_viewEvent')}
                <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          </aside>
        ) : null}
      </section> : null}

      <section className="discovery-results" id="discover-concerts" aria-labelledby="discovery-results-heading">
        <div className="discovery-results-title">
          {catalogue
            ? <h1 id="discovery-results-heading" ref={heading} tabIndex={-1}>{resultsTitle}</h1>
            : <h2 id="discovery-results-heading" ref={heading} tabIndex={-1}>{resultsTitle}</h2>}
          {!isHome && !isInitialLoading && failedPage !== 0 ? (
            <p role="status">{t('public:discovery_totalResults', {
              count: isPreview ? matches.length : catalog.total,
            })}</p>
          ) : null}
        </div>

        {!isHome ? <div className="discovery-controls">
          <details className="discovery-filter">
            <DiscoveryFilterTrigger count={filterCount} />
            <DiscoveryFilterPanel
              key={JSON.stringify([filters.date, filters.from, filters.to, filters.status, filters.city, filters.category, filters.price])}
              filters={filters} isPreview={isPreview} onApply={applyFilters}
            />
          </details>
          <label className="discovery-sort">
            <span>{t('public:discovery_sort')}</span>
            <select name="sort" value={filters.sort} onChange={(event) =>
              applyFilters({ sort: event.target.value as DiscoveryFilters['sort'] })}>
              {Object.entries(sortOptions).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
            </select>
          </label>
        </div> : null}

        {chips.length > 0 ? (
          <ul className="discovery-chips" aria-label={t('public:discovery_appliedFilters')}>
            {chips.map(({ key, label, clear }) => (
              <li key={key}>
                <button type="button" aria-label={t('public:discovery_removeFilter', { filter: label })} onClick={() => applyFilters(clear)}>
                  <span>{label}</span><X aria-hidden="true" />
                </button>
              </li>
            ))}
            <li><button className="discovery-clear" type="button" onClick={() => applyFilters(resetFilters)}>{t('public:discovery_clearAll')}</button></li>
          </ul>
        ) : null}

        {isInitialLoading ? <p className="buyer-state" role="status">{t('public:discovery_loading')}</p> : null}
        {failedPage === 0 ? <p className="buyer-state" role="alert">{t('public:discovery_loadError')}</p> : null}
        {!isInitialLoading && failedPage !== 0 && matches.length === 0 ? (
          <div className="buyer-state">
            <strong>{t(hasFilters ? 'public:discovery_noMatches' : 'public:discovery_noEvents')}</strong>
            <p>{t(hasFilters ? 'public:discovery_adjustFilters' : 'public:discovery_returnLater')}</p>
          </div>
        ) : null}

        {isHome ? <>
          {homeOnSale.length > 0 ? (
            <div className="discovery-home-group">
              <h3>{t('public:discovery_onSale')}</h3>
              {renderEventGrid(homeOnSale)}
            </div>
          ) : null}
          {homeOther.length > 0 ? renderEventGrid(homeOther) : null}
        </> : matches.length > 0 ? renderEventGrid(matches) : null}

        {(failedPage === 0 || catalogue && catalog.nextPage !== null) && !isInitialLoading ? (
          <div className="discovery-load-more">
            {failedPage !== null && failedPage > 0 ? <p role="alert">{t('public:discovery_nextPageError')}</p> : null}
            <button type="button" className="button button-secondary" onClick={loadMore} disabled={requestedPage !== null}>
              {t(failedPage !== null ? 'public:discovery_tryAgain'
                : requestedPage !== null ? 'public:discovery_loading' : 'public:discovery_loadMore')}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
