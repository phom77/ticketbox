import { useTranslation } from 'react-i18next';
import { concertTitle } from '../../features/concert/concertText';
import { currentLanguage, translate } from '../../i18n';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, Search } from 'lucide-react';
import { isRequestCanceled } from '../../api/client';
import { getConcerts, type ConcertSummary } from '../../api/concerts';
import { EventCard } from '../../components/EventCard';
import { fallbackConcertImage, RemoteImage } from '../../components/RemoteImage';

const statusFilters = [
  { value: 'all', get label() { return translate("public:homePage_tatCa"); } },
  { value: 'ON_SALE', get label() { return translate("public:homePage_dangBan"); } },
  { value: 'DRAFT', get label() { return translate("public:homePage_sapMoBan"); } },
  { value: 'SOLD_OUT', get label() { return translate("public:homePage_hetVe"); } },
] as const;
const legacyFilters: Record<string, string> = {
  'Tất cả': 'all', 'Đang bán': 'ON_SALE', 'Sắp mở bán': 'DRAFT', 'Hết vé': 'SOLD_OUT',
};

export function HomePage() {
  useTranslation();
  const language = currentLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [concerts, setConcerts] = useState<ConcertSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const requestedStatus = searchParams.get('status') ?? 'all';
  const normalizedStatus = legacyFilters[requestedStatus] ?? requestedStatus;
  const selectedStatus = statusFilters.find(({ value }) => value === normalizedStatus)?.value ?? 'all';
  const searchQuery = searchParams.get('q') ?? '';
  const [searchInput, setSearchInput] = useState(searchQuery);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    getConcerts(0, 60, controller.signal)
      .then((page) => {
        if (!active) return;
        setConcerts(page.content);
      })
      .catch((requestError: unknown) => {
        if (active && !isRequestCanceled(requestError)) {
          setError(translate("public:homePage_khongTheTaiDanhSachConcertHay"));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [reloadKey]);

  const sortedConcerts = useMemo(() => [...concerts].sort(compareConcerts), [concerts]);
  const featuredConcert =
    sortedConcerts.find((concert) => concert.status === 'ON_SALE') ?? sortedConcerts[0];

  const filteredConcerts = useMemo(
    () =>
      sortedConcerts
        .filter((concert) => {
          return selectedStatus === 'all' || concert.status === selectedStatus;
        })
        .filter((concert) => {
          const query = searchQuery.trim().toLocaleLowerCase(language);
          if (!query) return true;
          return `${concertTitle(concert, language)} ${concert.venueName}`.toLocaleLowerCase(language).includes(query);
        }),
    [language, searchQuery, selectedStatus, sortedConcerts],
  );

  const onSale = filteredConcerts.filter((concert) => concert.status === 'ON_SALE').slice(0, 6);
  const soldOut = filteredConcerts.filter((concert) => concert.status === 'SOLD_OUT').slice(0, 6);
  const openingSoon = filteredConcerts.filter((concert) => concert.status === 'DRAFT').slice(0, 6);

  function chooseStatus(status: (typeof statusFilters)[number]['value']) {
    const next = new URLSearchParams(searchParams);
    if (status === 'all') next.delete('status');
    else next.set('status', status);
    setSearchParams(next);
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams(searchParams);
    const query = searchInput.trim();
    if (query) next.set('q', query);
    else next.delete('q');
    setSearchParams(next);
    document.querySelector('#discover-concerts')?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <>
      <section className="hero discover-hero">
        <RemoteImage
          className="hero-image"
          src={featuredConcert?.posterUrl ?? fallbackConcertImage}
          alt=""
          width="1800"
          height="1000"
        />
        <div className="hero-scrim" />
        <div className="hero-content page-width">
          <p className="eyebrow">
            <span /> {translate("public:homePage_khamPhaTicketbox")}
          </p>
          <h1>
            {translate("public:homePage_timConcertPhuHop")}
            <br />
            <em>{translate("public:homePage_datVeThatYenTam")}</em>
          </h1>
          <p className="hero-copy">
            {translate("public:homePage_concertDuocNhomTheoNhuCauMua")}
          </p>
          <div className="hero-actions">
            {featuredConcert ? (
              <Link className="button button-primary" to={`/concerts/${featuredConcert.id}`}>
                {translate("public:homePage_xemConcertNoiBat")} <span aria-hidden="true">↗</span>
              </Link>
            ) : null}
            <a className="button button-secondary" href="#discover-concerts">
              {translate("public:homePage_duyetConcert")}
            </a>
          </div>
        </div>
      </section>

      <section className="market-search-wrap" aria-label={translate("public:homePage_timConcert")}>
        <form className="market-search page-width" onSubmit={submitSearch}>
          <label>
            <span>{translate("public:homePage_timKiem")}</span>
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={translate("public:homePage_ngheSiConcertHoacDiaDiem")}
            />
          </label>
          <label>
            <span>{translate("public:homePage_khuVuc")}</span>
            <input value={translate('countryVietnam')} readOnly aria-label={translate("public:homePage_khuVuc")} />
          </label>
          <button className="button button-primary" type="submit">
            <Search size={16} /> {translate("public:homePage_timKiem")}
          </button>
        </form>
      </section>

      <section className="event-section page-width" id="discover-concerts">
        <div className="section-heading discover-heading">
          <div>
            <p className="eyebrow">
              <span /> {translate("public:homePage_danhMucChonLoc")}
            </p>
          </div>
        </div>
        <div className="category-row" aria-label={translate("public:homePage_trangThaiConcert")}>
          {statusFilters.map(({ value: status, label }) => (
            <button
              key={status}
              type="button"
              className={selectedStatus === status ? 'active' : ''}
              aria-pressed={selectedStatus === status}
              onClick={() => chooseStatus(status)}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? <LoadingGrid /> : null}
        {error ? (
          <StatePanel
            title={translate("public:homePage_sanKhauVuaMatTinHieu")}
            copy={error}
            action={translate("public:homePage_thuLai")}
            onAction={() => setReloadKey((value) => value + 1)}
          />
        ) : null}
        {!loading && !error ? (
          <div className="discover-groups">
            {selectedStatus === 'all' || selectedStatus === 'ON_SALE' ? (
              <ConcertGroup
                title={translate("public:homePage_dangBanVe")}
                subtitle={translate("public:homePage_uuTienCacConcertCoTheMua")}
                icon={<CalendarDays size={18} />}
                concerts={onSale}
                emptyCopy={translate("public:homePage_chuaCoConcertDangBanPhuHop")}
              />
            ) : null}
            {selectedStatus === 'all' || selectedStatus === 'DRAFT' ? (
              <ConcertGroup
                title={translate("public:homePage_sapMoBan")}
                subtitle={translate("public:homePage_theoDoiTruocKhiCongVeMo")}
                icon={<CalendarDays size={18} />}
                concerts={openingSoon}
                emptyCopy={translate("public:homePage_chuaCoConcertSapMoBanPhu")}
              />
            ) : null}
            {selectedStatus === 'all' || selectedStatus === 'SOLD_OUT' ? (
              <ConcertGroup
                title={translate("public:homePage_daHetVe")}
                subtitle={translate("public:homePage_cacConcertDaBanHetVeHien")}
                icon={<CalendarDays size={18} />}
                concerts={soldOut}
                emptyCopy={translate("public:homePage_chuaCoConcertHetVePhuHop")}
              />
            ) : null}
          </div>
        ) : null}
      </section>
    </>
  );
}

function ConcertGroup({
  title,
  subtitle,
  icon,
  concerts,
  emptyCopy,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  concerts: ConcertSummary[];
  emptyCopy: string;
}) {
  useTranslation();
  return (
    <section className="discover-group">
      <div className="discover-group-head">
        <div className="discover-group-icon" aria-hidden="true">
          {icon}
        </div>
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
      </div>
      {concerts.length ? (
        <div className="event-grid discover-grid">
          {concerts.map((concert, index) => (
            <EventCard
              key={concert.id}
              priority={index < 2}
              event={{
                id: concert.id,
                title: concertTitle(concert),
                venue: concert.venueName,
                eventDate: concert.eventDate,
                status: concert.status,
                image: concert.posterUrl,
              }}
            />
          ))}
        </div>
      ) : emptyCopy ? (
        <div className="discover-empty">{emptyCopy}</div>
      ) : null}
    </section>
  );
}

function LoadingGrid() {
  useTranslation();
  return (
    <div className="event-grid" aria-label={translate("public:homePage_dangTaiConcert")} aria-live="polite">
      {[1, 2, 3].map((item) => (
        <div className="event-skeleton" key={item}>
          <div />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

function StatePanel({
  title,
  copy,
  action,
  onAction,
}: {
  title: string;
  copy: string;
  action: string;
  onAction: () => void;
}) {
  useTranslation();
  return (
    <div className="state-panel" role="status">
      <span className="state-icon" aria-hidden="true">
        !
      </span>
      <h3>{title}</h3>
      <p>{copy}</p>
      <button className="button button-secondary" type="button" onClick={onAction}>
        {action}
      </button>
    </div>
  );
}

function compareConcerts(a: ConcertSummary, b: ConcertSummary) {
  const statusWeight = (status: ConcertSummary['status']) => {
    if (status === 'ON_SALE') return 0;
    if (status === 'DRAFT') return 1;
    if (status === 'SOLD_OUT') return 2;
    if (status === 'COMPLETED') return 3;
    return 4;
  };
  const byStatus = statusWeight(a.status) - statusWeight(b.status);
  if (byStatus !== 0) return byStatus;
  return new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime();
}
