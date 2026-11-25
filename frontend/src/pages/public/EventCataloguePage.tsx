import { X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { translate } from '../../i18n';
import { BuyerState } from '../../components/feedback/BuyerState';
import { CardGridSkeleton } from '../../components/feedback/Skeleton';
import { EventCard } from '../../components/EventCard';
import { dateFormatter } from '../../data/formatters';
import { eventCard } from '../../features/discovery/cards';
import { DiscoveryFilterPanel } from '../../features/discovery/DiscoveryFilterPanel';
import {
  capitalize,
  discoveryOptions,
  discoverySearch,
  readDiscoveryFilters,
  readPageDepth,
  sortOptions,
  writeDiscoveryFilters,
  type DiscoveryFilters,
} from '../../features/discovery/filters';
import {
  useDiscoveryCatalog,
  type DiscoveryCatalog,
} from '../../features/discovery/useDiscoveryCatalog';
import { useDiscoveryFacets } from '../../features/discovery/useDiscoveryFacets';
import { categoryLabelKey } from '../../features/discovery/categories';
import './HomePage.css';

const filterDateLabel = dateFormatter({ dateStyle: 'medium', timeZone: 'UTC' });
const resetFilters = {
  q: '',
  date: '',
  from: '',
  to: '',
  status: '',
  city: '',
  category: '',
  price: '',
} as const;
const chipKeys = ['date', 'status', 'city', 'category', 'price'] as const;

type BackSnapshot = {
  key: string;
  catalog: DiscoveryCatalog;
  linkId: string;
  linkTop: number;
  scrollTop: number;
};

const recentLists = new Map<string, BackSnapshot>();

function setParam(params: URLSearchParams, key: string, value: string) {
  const next = new URLSearchParams(params);
  if (value) next.set(key, value);
  else next.delete(key);
  return next;
}

function categoryName(category: string) {
  const key = categoryLabelKey(category);
  return key ? translate(key) : capitalize(category);
}

export default function EventCataloguePage() {
  const { t } = useTranslation('public');
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const params = new URLSearchParams(location.search);
  const filters = readDiscoveryFilters(params);
  const facets = useDiscoveryFacets();
  const [restored] = useState(() =>
    navigationType === 'POP' ? recentLists.get(location.key) : undefined,
  );
  const { catalog, requestedPage, failedPage, loadMore, retry, loadingFirst, stale } =
    useDiscoveryCatalog(
      discoverySearch(filters),
      readPageDepth(params),
      restored?.catalog,
      (pages) =>
        navigate(
          {
            search: setParam(params, 'page', pages > 1 ? String(pages) : '').toString(),
            hash: location.hash,
          },
          { replace: true },
        ),
    );
  const [now, setNow] = useState(Date.now);
  const heading = useRef<HTMLHeadingElement>(null);
  const hasFilters = Boolean(filters.q || chipKeys.some((key) => filters[key]));
  const matches = catalog.concerts;
  const total = catalog.total;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useLayoutEffect(() => {
    if (!restored) return;
    const frame = requestAnimationFrame(() => {
      const link = document.getElementById(restored.linkId);
      const top = link
        ? window.scrollY + link.getBoundingClientRect().top - restored.linkTop
        : restored.scrollTop;
      window.scrollTo({ top, behavior: 'instant' });
      link?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [restored]);

  useEffect(() => {
    if (loadingFirst || location.hash !== '#discover-concerts' || restored?.key === location.key)
      return;
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement;
      if (navigationType === 'POP' && active !== document.body && active !== heading.current)
        return;
      heading.current?.scrollIntoView({ behavior: 'instant', block: 'start' });
      heading.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [loadingFirst, location.hash, location.key, navigationType, restored]);

  function savePosition(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.defaultPrevented
    )
      return;
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
    // A new filter set starts again from the first page.
    navigate(
      {
        search: setParam(writeDiscoveryFilters(params, next), 'page', '').toString(),
        hash: '#discover-concerts',
      },
      { preventScrollReset: true },
    );
  }

  const customDates =
    filters.date === 'custom'
      ? [
          filters.from && filterDateLabel.format(new Date(filters.from)),
          filters.to && filterDateLabel.format(new Date(filters.to)),
        ]
      : [];
  const dateChipLabel = customDates.length
    ? customDates[0] && customDates[1]
      ? t('public:discovery_range', { from: customDates[0], to: customDates[1] })
      : customDates[0]
        ? t('public:discovery_fromDate', { date: customDates[0] })
        : t('public:discovery_toDate', { date: customDates[1] })
    : '';
  const chips = [
    ...(filters.q ? [{ key: 'q', label: filters.q, clear: { q: '' } as const }] : []),
    ...chipKeys
      .filter((key) => filters[key])
      .map((key) => ({
        key,
        label:
          key === 'date' && dateChipLabel
            ? dateChipLabel
            : key === 'city'
              ? filters.city
              : key === 'category'
                ? categoryName(filters.category)
                : t((discoveryOptions[key] as Record<string, string>)[filters[key]]),
        clear: key === 'date' ? ({ date: '', from: '', to: '' } as const) : { [key]: '' },
      })),
  ];

  const countKnown = !loadingFirst && !stale && failedPage !== 0;
  const resultsTitle = !countKnown
    ? t(hasFilters ? 'public:discovery_results' : 'public:discovery_upcomingEvents')
    : filters.q
      ? t('public:discovery_resultsFor', { count: total, q: filters.q })
      : hasFilters
        ? t('public:discovery_resultsCount', { count: total })
        : t('public:discovery_upcomingEvents');

  return (
    <div
      className="buyer-page discovery-page page-width"
      data-discovery-restore={restored ? true : undefined}
    >
      <section
        className="discovery-results"
        id="discover-concerts"
        aria-labelledby="discovery-results-heading"
        aria-busy={loadingFirst || stale}
      >
        <div className="discovery-results-title">
          <h1 id="discovery-results-heading" ref={heading} tabIndex={-1}>
            {resultsTitle}
          </h1>
          {countKnown && !hasFilters ? (
            <p role="status">{t('public:discovery_totalResults', { count: total })}</p>
          ) : null}
        </div>

        <div className="discovery-controls">
          <DiscoveryFilterPanel
            filters={filters}
            facets={facets}
            count={countKnown ? total : 0}
            onApply={applyFilters}
          />
          <label className="discovery-sort">
            <span>{t('public:discovery_sort')}</span>
            <select
              name="sort"
              value={filters.sort}
              onChange={(event) =>
                applyFilters({ sort: event.target.value as DiscoveryFilters['sort'] })
              }
            >
              {Object.entries(sortOptions).map(([value, label]) => (
                <option key={value} value={value}>
                  {t(label)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {chips.length > 0 ? (
          <ul className="discovery-chips" aria-label={t('public:discovery_appliedFilters')}>
            {chips.map(({ key, label, clear }) => (
              <li key={key}>
                <button
                  type="button"
                  aria-label={t('public:discovery_removeFilter', { filter: label })}
                  onClick={() => applyFilters(clear)}
                >
                  <span>{label}</span>
                  <X aria-hidden="true" />
                </button>
              </li>
            ))}
            <li>
              <button
                className="discovery-clear"
                type="button"
                onClick={() => applyFilters(resetFilters)}
              >
                {t('public:discovery_clearAll')}
              </button>
            </li>
          </ul>
        ) : null}

        {loadingFirst && matches.length === 0 ? (
          <CardGridSkeleton count={8} label={t('public:discovery_loading')} />
        ) : null}
        {failedPage === 0 ? (
          <BuyerState tone="error">{t('public:discovery_loadError')}</BuyerState>
        ) : null}
        {!loadingFirst && !stale && failedPage !== 0 && matches.length === 0 ? (
          <BuyerState
            tone="empty"
            headingLevel={3}
            title={t(hasFilters ? 'public:discovery_noMatches' : 'public:discovery_noEvents')}
            actions={
              hasFilters ? (
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => applyFilters(resetFilters)}
                >
                  {t('public:discovery_clearAll')}
                </button>
              ) : undefined
            }
          >
            {t(hasFilters ? 'public:discovery_adjustFilters' : 'public:discovery_returnLater')}
          </BuyerState>
        ) : null}

        {matches.length > 0 ? (
          <div className="discovery-grid" data-stale={stale ? 'true' : undefined}>
            {matches.map((concert, index) => {
              const card = eventCard(concert, now);
              return (
                <EventCard
                  key={concert.id}
                  event={card}
                  priority={index < 2}
                  action={
                    card.status === 'on-sale'
                      ? t('public:discovery_findTickets')
                      : t('public:discovery_viewEvent')
                  }
                  heading="h2"
                  linkId={`discovery-event-${concert.id}`}
                  onOpen={savePosition}
                />
              );
            })}
          </div>
        ) : null}

        {failedPage === 0 || (catalog.nextPage !== null && !loadingFirst && !stale) ? (
          <div className="discovery-load-more">
            {failedPage !== null && failedPage > 0 ? (
              <p role="alert">{t('public:discovery_nextPageError')}</p>
            ) : null}
            <button
              type="button"
              className="button button-secondary"
              onClick={failedPage !== null ? retry : loadMore}
              disabled={requestedPage !== null}
            >
              {t(
                failedPage !== null
                  ? 'public:discovery_tryAgain'
                  : requestedPage !== null
                    ? 'public:discovery_loading'
                    : 'public:discovery_loadMore',
              )}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
