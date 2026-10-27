import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, Search } from 'lucide-react';
import { isRequestCanceled } from '../../api/client';
import { getConcerts, type ConcertSummary } from '../../api/concerts';
import { EventCard } from '../../components/EventCard';
import { fallbackConcertImage, RemoteImage } from '../../components/RemoteImage';

const statusFilters = ['Tất cả', 'Đang bán', 'Sắp mở bán', 'Hết vé'] as const;

export function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [concerts, setConcerts] = useState<ConcertSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const selectedStatus = searchParams.get('status') ?? 'Tất cả';
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
          setError('Không thể tải danh sách concert. Hãy kiểm tra backend đang chạy rồi thử lại.');
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
          if (selectedStatus === 'Đang bán') return concert.status === 'ON_SALE';
          if (selectedStatus === 'Sắp mở bán') return concert.status === 'DRAFT';
          if (selectedStatus === 'Hết vé') return concert.status === 'SOLD_OUT';
          return true;
        })
        .filter((concert) => {
          const query = searchQuery.trim().toLocaleLowerCase('vi-VN');
          if (!query) return true;
          return `${concert.title} ${concert.venueName}`.toLocaleLowerCase('vi-VN').includes(query);
        }),
    [searchQuery, selectedStatus, sortedConcerts],
  );

  const onSale = filteredConcerts.filter((concert) => concert.status === 'ON_SALE').slice(0, 6);
  const soldOut = filteredConcerts.filter((concert) => concert.status === 'SOLD_OUT').slice(0, 6);
  const openingSoon = filteredConcerts.filter((concert) => concert.status === 'DRAFT').slice(0, 6);

  function chooseStatus(status: (typeof statusFilters)[number]) {
    const next = new URLSearchParams(searchParams);
    if (status === 'Tất cả') next.delete('status');
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
            <span /> Khám phá TicketBox
          </p>
          <h1>
            Tìm concert phù hợp.
            <br />
            <em>Đặt vé thật yên tâm.</em>
          </h1>
          <p className="hero-copy">
            Concert được nhóm theo nhu cầu mua vé, giúp bạn nhanh chóng biết chương trình nào đang
            bán, sắp mở bán hoặc đã hết vé.
          </p>
          <div className="hero-actions">
            {featuredConcert ? (
              <Link className="button button-primary" to={`/concerts/${featuredConcert.id}`}>
                Xem concert nổi bật <span aria-hidden="true">↗</span>
              </Link>
            ) : null}
            <a className="button button-secondary" href="#discover-concerts">
              Duyệt concert
            </a>
          </div>
        </div>
      </section>

      <section className="market-search-wrap" aria-label="Tìm concert">
        <form className="market-search page-width" onSubmit={submitSearch}>
          <label>
            <span>Tìm kiếm</span>
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Nghệ sĩ, concert hoặc địa điểm"
            />
          </label>
          <label>
            <span>Khu vực</span>
            <input value="Việt Nam" readOnly aria-label="Khu vực" />
          </label>
          <button className="button button-primary" type="submit">
            <Search size={16} /> Tìm kiếm
          </button>
        </form>
      </section>

      <section className="event-section page-width" id="discover-concerts">
        <div className="section-heading discover-heading">
          <div>
            <p className="eyebrow">
              <span /> Danh mục chọn lọc
            </p>
          </div>
        </div>
        <div className="category-row" aria-label="Trạng thái concert">
          {statusFilters.map((status) => (
            <button
              key={status}
              type="button"
              className={selectedStatus === status ? 'active' : ''}
              aria-pressed={selectedStatus === status}
              onClick={() => chooseStatus(status)}
            >
              {status}
            </button>
          ))}
        </div>

        {loading ? <LoadingGrid /> : null}
        {error ? (
          <StatePanel
            title="Sân khấu vừa mất tín hiệu."
            copy={error}
            action="Thử lại"
            onAction={() => setReloadKey((value) => value + 1)}
          />
        ) : null}
        {!loading && !error ? (
          <div className="discover-groups">
            {selectedStatus === 'Tất cả' || selectedStatus === 'Đang bán' ? (
              <ConcertGroup
                title="Đang bán vé"
                subtitle="Ưu tiên các concert có thể mua ngay."
                icon={<CalendarDays size={18} />}
                concerts={onSale}
                emptyCopy="Chưa có concert đang bán phù hợp bộ lọc."
              />
            ) : null}
            {selectedStatus === 'Tất cả' || selectedStatus === 'Sắp mở bán' ? (
              <ConcertGroup
                title="Sắp mở bán"
                subtitle="Theo dõi trước khi cổng vé mở."
                icon={<CalendarDays size={18} />}
                concerts={openingSoon}
                emptyCopy="Chưa có concert sắp mở bán phù hợp bộ lọc."
              />
            ) : null}
            {selectedStatus === 'Tất cả' || selectedStatus === 'Hết vé' ? (
              <ConcertGroup
                title="Đã hết vé"
                subtitle="Các concert đã bán hết vé hiện tại."
                icon={<CalendarDays size={18} />}
                concerts={soldOut}
                emptyCopy="Chưa có concert hết vé phù hợp bộ lọc."
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
                title: concert.title,
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
  return (
    <div className="event-grid" aria-label="Đang tải concert" aria-live="polite">
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
