import { ArrowRight, Search, Ticket, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigationType, useSearchParams } from 'react-router-dom';
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
    href: concert.performance ? eventPath(concert.performance.eventId) : `/concerts/${encodeURIComponent(concert.id)}`,
    eventDate: concert.eventDate, image: concert.posterUrl, status: discoverySaleState(concert, now),
  };
}

export function HomePage({ previewConcerts }: { previewConcerts?: DiscoveryConcert[] }) {
  const { t } = useTranslation('public');
  const location = useLocation();
  const navigationType = useNavigationType();
  const [params, setParams] = useSearchParams();
  const isPreview = Boolean(previewConcerts);
  const [restored] = useState(() =>
    !isPreview && navigationType === 'POP' ? recentLists.get(location.key) : undefined,
  );
  const { catalog, concerts, hasMore: morePages, requestedPage, failedPage, loadMore } =
    useDiscoveryCatalog(restored?.catalog, !isPreview);
  const [now, setNow] = useState(Date.now);
  const heading = useRef<HTMLHeadingElement>(null);
  const filters = readDiscoveryFilters(params, isPreview);
  const source = previewConcerts ?? concerts;
  const loadedCount = new Set(source.map((concert) => concert.performance?.eventId ?? concert.id)).size;
  const isInitialLoading = requestedPage === 0;
  const hasMore = !isPreview && morePages;
  const matches = filterConcerts(source, filters, now);
  const hasFilters = Boolean(filters.q || chipKeys.some((key) => filters[key]));
  const showComingSoon = !hasFilters && !isPreview;
  const comingSoon = showComingSoon ? matches.filter((concert) => {
    const state = discoverySaleState(concert, now);
    return state === 'upcoming' || state === 'waiting-room';
  }) : [];
  const comingSoonIds = new Set(comingSoon.map((concert) => concert.id));
  const availableEvents = matches.filter((concert) => !comingSoonIds.has(concert.id));
  const featureConcert = !hasFilters && !isPreview && matches.length > 1
    ? availableEvents.find((concert) => concert.posterUrl && discoverySaleState(concert, now) === 'on-sale')
      ?? availableEvents.find((concert) => concert.posterUrl)
    : undefined;
  const feature = featureConcert ? eventCard(featureConcert, now) : null;
  const grid = feature ? availableEvents.filter((concert) => concert.id !== feature.id) : availableEvents;

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

  function showResults() {
    requestAnimationFrame(() => {
      heading.current?.scrollIntoView({ behavior: 'instant', block: 'start' });
      heading.current?.focus({ preventScroll: true });
    });
  }

  function applyFilters(next: Partial<DiscoveryFilters>) {
    setParams(writeDiscoveryFilters(params, next));
    showResults();
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
        {events.map((concert, index) => (
          <EventCard
            key={concert.id}
            event={{
              ...eventCard(concert, now),
              supportingText: isPreview && concert.price !== undefined
                ? [concert.city && t(discoveryOptions.city[concert.city]),
                  concert.category && t(discoveryOptions.category[concert.category]),
                  currency.format(concert.price)].filter(Boolean).join(' · ')
                : undefined,
            }}
            priority={index < 2 && !feature}
            preview={isPreview}
            linkId={`discovery-event-${concert.id}`}
            onOpen={savePosition}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="buyer-page discovery-page page-width" data-discovery-restore={restored ? true : undefined}>
      <section className="discovery-intro" aria-labelledby="discovery-title">
        <div className="discovery-main">
          <h1 id="discovery-title">{t('public:discovery_title')}</h1>
          <form className="discovery-search" role="search" aria-label={t('public:discovery_search')} onSubmit={submitSearch}>
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
          </form>
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
                {t('public:discovery_viewEvent')} <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          </aside>
        ) : null}
      </section>

      <section className="discovery-results" id="discover-concerts" aria-labelledby="discovery-results-heading">
        <div className="discovery-results-title">
          <h2 id="discovery-results-heading" ref={heading} tabIndex={-1}>
            {t(hasFilters ? 'public:discovery_results' : 'public:discovery_upcomingEvents')}
          </h2>
          {source.length > 0 ? (
            <p role="status">{t(hasMore ? 'public:discovery_loadedResults' : 'public:discovery_totalResults', {
              count: matches.length, loaded: loadedCount,
            })}</p>
          ) : null}
        </div>

        <div className="discovery-controls">
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
              setParams(writeDiscoveryFilters(params, { sort: event.target.value as DiscoveryFilters['sort'] }))}>
              {Object.entries(sortOptions).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
            </select>
          </label>
        </div>

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
            <h3>{t(hasMore ? 'public:discovery_noLoadedMatches'
              : hasFilters ? 'public:discovery_noMatches' : 'public:discovery_noEvents')}</h3>
            <p>{t(hasMore ? 'public:discovery_canLoadMore'
              : hasFilters ? 'public:discovery_adjustFilters' : 'public:discovery_returnLater')}</p>
          </div>
        ) : null}

        <div className="discovery-event-groups" data-sparse-upcoming={comingSoon.length === 1 && grid.length > 0 || undefined}>
          {comingSoon.length > 0 ? (
            <section className="discovery-coming-soon" aria-labelledby="discovery-coming-soon-heading">
              <h3 id="discovery-coming-soon-heading">{t('public:discovery_comingSoon')}</h3>
              {renderEventGrid(comingSoon)}
            </section>
          ) : null}
          {grid.length > 0 ? renderEventGrid(grid) : null}
        </div>

        {hasMore && !isInitialLoading ? (
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
