import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Clock, MapPin, Music, Search } from 'lucide-react';
import { isRequestCanceled } from '../../api/client';
import { getDiscoveryEvents } from '../../api/performances';
import { dateFormatter } from '../../data/formatters';
import {
  addRecentSearch,
  buildSuggestions,
  clearRecentSearches,
  readRecentSearches,
  recentSearchLabel,
  type HeaderSearchValues,
  type RecentSearch,
  type SearchSuggestions,
} from '../../features/discovery/headerSearch';
import { dateOptions, discoveryDateParam } from '../../features/discovery/filters';

type Option =
  | { kind: 'event'; id: string; label: string; meta: string; href: string }
  | { kind: 'venue'; id: string; label: string }
  | { kind: 'recent'; id: string; label: string; search: RecentSearch }
  | { kind: 'clear'; id: string; label: string };

type SuggestionState =
  | { status: 'idle' }
  | { status: 'loading'; query: string }
  | { status: 'ready'; query: string; suggestions: SearchSuggestions }
  | { status: 'error'; query: string };

const suggestionDelayMs = 250;
const minimumQueryLength = 2;
const shortDate = dateFormatter({ day: 'numeric', month: 'short' });
const suggestionDate = dateFormatter({ day: 'numeric', month: 'short', year: 'numeric' });

function formatDay(value: string) {
  const date = discoveryDateParam(value);
  return date ? shortDate.format(new Date(date + 'T12:00:00Z')) : '';
}

/**
 * The buyer header search: Where (city or venue), When (date presets or a calendar
 * range) and What (artist, event or venue, with suggestions and recent searches).
 */
export function HeaderSearch({
  initial,
  inputRef,
  onSearch,
  onOpenEvent,
}: {
  initial: HeaderSearchValues;
  inputRef?: RefObject<HTMLInputElement>;
  onSearch: (values: HeaderSearchValues) => void;
  onOpenEvent: (href: string) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [where, setWhere] = useState(initial.where);
  const [what, setWhat] = useState(initial.what);
  const [date, setDate] = useState(initial.date);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [whenOpen, setWhenOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState(readRecentSearches);
  const [suggestionState, setSuggestionState] = useState<SuggestionState>({ status: 'idle' });
  const whereInput = useRef<HTMLInputElement>(null);
  const whenButton = useRef<HTMLButtonElement>(null);
  const whenPanel = useRef<HTMLDivElement>(null);
  const query = what.trim();
  const wantsSuggestions = query.length >= minimumQueryLength;

  useEffect(() => {
    if (!wantsSuggestions) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSuggestionState({ status: 'loading', query });
      void getDiscoveryEvents(new URLSearchParams({ q: query }).toString(), 0, controller.signal)
        .then((page) => {
          if (controller.signal.aborted) return;
          setSuggestionState({
            status: 'ready',
            query,
            suggestions: buildSuggestions(page.content, query),
          });
        })
        .catch((error) => {
          if (!controller.signal.aborted && !isRequestCanceled(error))
            setSuggestionState({ status: 'error', query });
        });
    }, suggestionDelayMs);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, wantsSuggestions]);

  useEffect(() => {
    if (!whenOpen) return;
    function dismiss(event: PointerEvent) {
      const target = event.target as Node;
      if (!whenPanel.current?.contains(target) && !whenButton.current?.contains(target))
        setWhenOpen(false);
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [whenOpen]);

  const current =
    wantsSuggestions && suggestionState.status !== 'idle' && suggestionState.query === query
      ? suggestionState
      : null;
  const options: Option[] = [];
  if (!wantsSuggestions) {
    recent.forEach((search, index) =>
      options.push({
        kind: 'recent',
        id: `${id}-recent-${index}`,
        label: recentSearchLabel(search),
        search,
      }),
    );
    if (recent.length)
      options.push({
        kind: 'clear',
        id: `${id}-clear`,
        label: t('shared:headerSearch_clearRecent'),
      });
  } else if (current?.status === 'ready') {
    current.suggestions.events.forEach((event) =>
      options.push({
        kind: 'event',
        id: `${id}-event-${event.id}`,
        label: event.title,
        meta: [event.venue, event.date ? suggestionDate.format(new Date(event.date)) : '']
          .filter(Boolean)
          .join(' · '),
        href: event.href,
      }),
    );
    current.suggestions.venues.forEach((venue, index) =>
      options.push({ kind: 'venue', id: `${id}-venue-${index}`, label: venue }),
    );
  }
  const optionGroups = {
    recent: options.filter((option) => option.kind === 'recent' || option.kind === 'clear'),
    event: options.filter((option) => option.kind === 'event'),
    venue: options.filter((option) => option.kind === 'venue'),
  };
  const message = !wantsSuggestions
    ? recent.length
      ? ''
      : null
    : !current || current.status === 'loading'
      ? t('shared:headerSearch_loadingSuggestions')
      : current.status === 'error'
        ? t('shared:headerSearch_suggestionsFailed')
        : options.length
          ? ''
          : t('shared:headerSearch_noSuggestions');
  const popupVisible = listOpen && (options.length > 0 || Boolean(message));
  const activeOption = popupVisible && active >= 0 ? options[active] : undefined;
  const listboxId = `${id}-suggestions`;
  const whenLabel =
    date === 'custom'
      ? from || to
        ? [formatDay(from), formatDay(to)].filter(Boolean).join(' – ')
        : t(`public:${dateOptions.custom}`)
      : t(`public:${dateOptions[date]}`);

  function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const custom = date === 'custom' && Boolean(from || to);
    const values: HeaderSearchValues = {
      where: where.trim(),
      what: what.trim(),
      date: date === 'custom' && !custom ? '' : date,
      from: custom ? from : '',
      to: custom ? to : '',
    };
    if (values.what || values.where) setRecent(addRecentSearch(values));
    setListOpen(false);
    setWhenOpen(false);
    onSearch(values);
  }

  function choose(option: Option) {
    setActive(-1);
    if (option.kind === 'event') {
      setRecent(addRecentSearch({ what, where }));
      setListOpen(false);
      onOpenEvent(option.href);
    } else if (option.kind === 'venue') {
      setWhere(option.label);
      setListOpen(false);
      whereInput.current?.focus();
    } else if (option.kind === 'recent') {
      setWhat(option.search.what);
      setWhere(option.search.where);
      setRecent(addRecentSearch(option.search));
      setListOpen(false);
      onSearch({ ...option.search, date, from, to });
    } else {
      clearRecentSearches();
      setRecent([]);
    }
  }

  function onWhatKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!listOpen) {
        setListOpen(true);
        setActive(event.key === 'ArrowDown' ? 0 : options.length - 1);
        return;
      }
      if (!options.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((index) => {
        const next = index + step;
        return next >= options.length ? 0 : next < 0 ? options.length - 1 : next;
      });
    } else if (event.key === 'Enter' && activeOption) {
      event.preventDefault();
      choose(activeOption);
    } else if (event.key === 'Escape' && popupVisible) {
      // Close the suggestions first; a second Escape closes the mobile search panel.
      event.preventDefault();
      setListOpen(false);
      setActive(-1);
    } else if (event.key === 'Tab') {
      setListOpen(false);
    }
  }

  function renderOption(option: Option) {
    const selected = activeOption?.id === option.id;
    const Icon =
      option.kind === 'event'
        ? Music
        : option.kind === 'venue'
          ? MapPin
          : option.kind === 'recent'
            ? Clock
            : null;
    return (
      <div
        key={option.id}
        id={option.id}
        role="option"
        aria-selected={selected}
        className="header-search-option"
        data-kind={option.kind}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => choose(option)}
      >
        {Icon ? <Icon size={16} aria-hidden="true" /> : null}
        <span>
          <span className="header-search-option-label">{option.label}</span>
          {option.kind === 'event' && option.meta ? (
            <small className="header-search-option-meta">{option.meta}</small>
          ) : null}
        </span>
      </div>
    );
  }

  return (
    <form
      className="public-header-search"
      role="search"
      aria-label={t('shared:publicLayout_timSuKien')}
      onSubmit={submit}
    >
      <div className="header-search-field header-search-where">
        <label htmlFor={`${id}-where`}>
          <span aria-hidden="true">{t('shared:headerSearch_where')}</span>
          <span className="sr-only">{t('shared:headerSearch_whereName')}</span>
        </label>
        <input
          ref={whereInput}
          id={`${id}-where`}
          name="where"
          type="text"
          value={where}
          maxLength={80}
          autoComplete="off"
          placeholder={t('shared:headerSearch_wherePlaceholder')}
          onChange={(event) => setWhere(event.target.value)}
        />
      </div>

      <div className="header-search-field header-search-when">
        <span id={`${id}-when-label`} className="header-search-label" aria-hidden="true">
          {t('shared:headerSearch_when')}
        </span>
        <button
          ref={whenButton}
          type="button"
          className="header-search-when-trigger"
          aria-expanded={whenOpen}
          aria-controls={`${id}-when-panel`}
          aria-label={t('shared:headerSearch_whenName', { value: whenLabel })}
          onClick={() => setWhenOpen((open) => !open)}
        >
          <CalendarDays size={16} aria-hidden="true" />
          <span>{whenLabel}</span>
        </button>
        {whenOpen ? (
          <div
            ref={whenPanel}
            id={`${id}-when-panel`}
            className="header-search-when-panel"
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              event.preventDefault();
              setWhenOpen(false);
              whenButton.current?.focus();
            }}
          >
            <fieldset>
              <legend>{t('shared:headerSearch_whenLegend')}</legend>
              {(Object.keys(dateOptions) as Array<keyof typeof dateOptions>).map((value) => (
                <label key={value || 'any'} className="header-search-when-option">
                  <input
                    type="radio"
                    name={`${id}-date`}
                    value={value}
                    checked={date === value}
                    onChange={() => setDate(value)}
                  />
                  <span>{t(`public:${dateOptions[value]}`)}</span>
                </label>
              ))}
            </fieldset>
            {date === 'custom' ? (
              <div className="header-search-when-range">
                <label>
                  <span>{t('public:discovery_startDate')}</span>
                  <input
                    type="date"
                    value={from}
                    max={to || undefined}
                    onChange={(event) => setFrom(event.target.value)}
                  />
                </label>
                <label>
                  <span>{t('public:discovery_endDate')}</span>
                  <input
                    type="date"
                    value={to}
                    min={from || undefined}
                    onChange={(event) => setTo(event.target.value)}
                  />
                </label>
              </div>
            ) : null}
            <button
              type="button"
              className="button button-secondary header-search-when-done"
              onClick={() => {
                setWhenOpen(false);
                whenButton.current?.focus();
              }}
            >
              {t('shared:headerSearch_done')}
            </button>
          </div>
        ) : null}
      </div>

      <div className="header-search-field header-search-what">
        <label htmlFor={`${id}-what`}>
          <span aria-hidden="true">{t('shared:headerSearch_what')}</span>
          <span className="sr-only">{t('shared:publicLayout_timSuKien')}</span>
        </label>
        <input
          ref={inputRef}
          id={`${id}-what`}
          name="q"
          type="search"
          role="combobox"
          value={what}
          maxLength={160}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={popupVisible}
          aria-controls={listboxId}
          aria-activedescendant={activeOption?.id}
          placeholder={t('shared:headerSearch_whatPlaceholder')}
          onChange={(event) => {
            setWhat(event.target.value);
            setActive(-1);
            setListOpen(true);
          }}
          onFocus={() => setListOpen(true)}
          onBlur={() => setListOpen(false)}
          onKeyDown={onWhatKeyDown}
        />
        <div className="header-search-popup" hidden={!popupVisible}>
          {message ? <p className="header-search-message">{message}</p> : null}
          <div
            id={listboxId}
            role="listbox"
            aria-label={t('shared:headerSearch_suggestions')}
            className="header-search-listbox"
          >
            {optionGroups.recent.length ? (
              <div role="group" aria-labelledby={`${id}-group-recent`}>
                <div role="presentation" id={`${id}-group-recent`} className="header-search-group">
                  {t('shared:headerSearch_recent')}
                </div>
                {optionGroups.recent.map(renderOption)}
              </div>
            ) : null}
            {optionGroups.event.length ? (
              <div role="group" aria-labelledby={`${id}-group-events`}>
                <div role="presentation" id={`${id}-group-events`} className="header-search-group">
                  {t('shared:headerSearch_events')}
                </div>
                {optionGroups.event.map(renderOption)}
              </div>
            ) : null}
            {optionGroups.venue.length ? (
              <div role="group" aria-labelledby={`${id}-group-venues`}>
                <div role="presentation" id={`${id}-group-venues`} className="header-search-group">
                  {t('shared:headerSearch_venues')}
                </div>
                {optionGroups.venue.map(renderOption)}
              </div>
            ) : null}
          </div>
        </div>
        <p className="sr-only" role="status">
          {popupVisible && wantsSuggestions && current?.status === 'ready'
            ? t('shared:headerSearch_suggestionCount', { count: options.length })
            : ''}
        </p>
      </div>

      <button
        type="submit"
        className="header-search-submit"
        aria-label={t('shared:publicLayout_timKiem')}
      >
        <Search aria-hidden="true" size={20} />
        <span className="header-search-submit-label">{t('shared:publicLayout_timKiem')}</span>
      </button>
    </form>
  );
}
