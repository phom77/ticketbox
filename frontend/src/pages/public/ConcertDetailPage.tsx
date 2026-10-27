import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { isRequestCanceled } from '../../api/client';
import {
  getConcert,
  getConcerts,
  getConcertTicketTypes,
  type ConcertDetail,
  type ConcertSummary,
  type TicketType,
} from '../../api/concerts';
import { EventCard } from '../../components/EventCard';
import { RemoteImage } from '../../components/RemoteImage';
import { currency } from '../../data/formatters';

export function ConcertDetailPage() {
  const { id } = useParams();
  const [concert, setConcert] = useState<ConcertDetail | null>(null);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [relatedConcerts, setRelatedConcerts] = useState<ConcertSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([getConcert(id, controller.signal), getConcerts(0, 4, controller.signal)])
      .then(async ([detail, page]) => {
        if (!active) return;
        const currentTicketTypes = detail.ticketTypes?.length
          ? detail.ticketTypes
          : await getConcertTicketTypes(detail.id, controller.signal);
        if (!active) return;
        setConcert(detail);
        setTicketTypes(currentTicketTypes);
        setRelatedConcerts(page.content.filter((item) => item.id !== detail.id).slice(0, 3));
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (active && !isRequestCanceled(requestError)) setError('Không thể tải concert này.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [id, reloadKey]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const lowestPrice = useMemo(() => {
    const prices = ticketTypes.filter((item) => item.isActive).map((item) => item.price);
    return prices.length ? Math.min(...prices) : null;
  }, [ticketTypes]);

  if (loading)
    return (
      <div className="detail-skeleton" aria-live="polite">
        <div className="detail-skeleton-hero" />
        <div className="page-width detail-skeleton-copy">
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  if (error || !concert) {
    return (
      <div className="page-width detail-error state-panel">
        <span className="state-icon">!</span>
        <h1>Concert không khả dụng</h1>
        <p>{error ?? 'Không tìm thấy concert được yêu cầu.'}</p>
        <button
          className="button button-primary"
          type="button"
          onClick={() => setReloadKey((value) => value + 1)}
        >
          Thử lại
        </button>
        <Link className="text-link" to="/">
          Quay lại danh sách concert
        </Link>
      </div>
    );
  }

  const concertDate = new Date(concert.eventDate);
  const doorsOpen = concert.doorsOpenAt
    ? new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(
        new Date(concert.doorsOpenAt),
      )
    : 'Sẽ thông báo';
  const saleStartAt = new Date(concert.saleStartAt).getTime();
  const waitingRoomOpensAt = saleStartAt - 60 * 60 * 1_000;
  const saleNotStarted = saleStartAt > now;
  const waitingRoomNotOpen = waitingRoomOpensAt > now;
  const waitingRoomOpen = saleNotStarted && !waitingRoomNotOpen;
  const saleEnded = concert.saleEndAt ? new Date(concert.saleEndAt).getTime() < now : false;
  const saleStart = new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(concert.saleStartAt));
  const waitingRoomOpenTime = new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(waitingRoomOpensAt));
  const saleEnd = concert.saleEndAt
    ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(concert.saleEndAt),
      )
    : null;
  const concertDateTime = new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(concertDate);
  const canEnterWaitingRoom = concert.status === 'ON_SALE' && !saleEnded && !waitingRoomNotOpen;

  return (
    <>
      <section className="detail-hero">
        <RemoteImage src={concert.posterUrl ?? undefined} alt="" width="1800" height="1000" />
        <div className="detail-overlay" />
        <div className="detail-hero-content page-width">
          <Link className="back-link" to="/">
            ← Tất cả concert
          </Link>
          <div className="detail-title">
            <p className="eyebrow">
              <span /> Live tại Việt Nam · {concert.status.replace('_', ' ')}
            </p>
            <h1>{concert.title}</h1>
            <p className="artist-line">
              {concert.artistBio
                ? 'Gặp gỡ nghệ sĩ của đêm diễn'
                : 'Trải nghiệm chính thức từ TicketBox'}
            </p>
          </div>
          <div className="detail-facts">
            <Fact label="Ngày diễn" value={concertDateTime} />
            <Fact label="Mở cửa" value={doorsOpen} />
            <Fact label="Địa điểm" value={concert.venueName} />
          </div>
        </div>
      </section>
      <section className="detail-body page-width">
        <article className="detail-story">
          {concert.artistBio ? (
            <section className="detail-section artist-section artist-section-featured">
              <p className="eyebrow">
                <span /> Nghệ sĩ biểu diễn
              </p>
              <h2>
                Gặp gỡ những người đứng sau <em>sân khấu.</em>
              </h2>
              <p className="artist-biography">{concert.artistBio}</p>
            </section>
          ) : null}
          <section className="detail-section detail-about-section">
            <p className="eyebrow">
              <span /> Về đêm diễn
            </p>
            <h2>
              Trải nghiệm live được tạo nên từ <em>âm thanh, ánh sáng và kết nối.</em>
            </h2>
            <p>{concert.description || 'Một đêm nhạc live dành cho những người yêu âm nhạc.'}</p>
            <div className="feature-row">
              <Feature
                number="01"
                title="Sản xuất giàu trải nghiệm"
                copy="Sân khấu điện ảnh cùng âm thanh không gian."
              />
              <Feature
                number="02"
                title="Vé chính thức"
                copy={`${ticketTypes.length} khu vé đã xác thực.`}
              />
              <Feature
                number="03"
                title="Vào cổng dễ dàng"
                copy="Vé mobile và đội ngũ hỗ trợ riêng."
              />
            </div>
          </section>
          <section className="detail-section ticket-types-section" aria-labelledby="ticket-types-title">
            <p className="eyebrow">
              <span /> Lựa chọn vé
            </p>
            <h2 id="ticket-types-title">
              Chọn <em>trải nghiệm</em> của bạn.
            </h2>
            <div className="ticket-types-list">
              {ticketTypes.length ? (
                ticketTypes.map((ticketType) => (
                  <div
                    className={`ticket-type-summary ${ticketType.availableQty === 0 ? 'is-sold-out' : ''}`}
                    key={ticketType.id}
                  >
                    <div>
                      <strong>{ticketType.name}</strong>
                      <span>
                        {ticketType.availableQty > 0 ? 'Còn vé' : 'Hết vé'}
                      </span>
                    </div>
                    <strong>{currency.format(ticketType.price)}</strong>
                  </div>
                ))
              ) : (
                <div className="ticket-type-empty">
                  Các khu vé đang được chuẩn bị cho concert này.
                </div>
              )}
            </div>
          </section>
        </article>
        <aside className="booking-card">
          <p className="booking-label">{lowestPrice === null ? 'Thông tin vé' : 'Giá vé từ'}</p>
          <p className="booking-price">
            {lowestPrice === null ? 'Sắp có' : currency.format(lowestPrice)}
          </p>
          <div className="booking-divider" />
          <div className="booking-detail">
            <span>Ngày diễn</span>
            <strong>{concertDateTime}</strong>
          </div>
          <div className="booking-detail">
            <span>Mở bán</span>
            <strong>{saleStart}</strong>
          </div>
          {saleEnd ? (
            <div className="booking-detail">
              <span>Kết thúc bán</span>
              <strong>{saleEnd}</strong>
            </div>
          ) : null}
          <div className="booking-detail">
            <span>Địa điểm</span>
            <strong>{concert.venueAddress}</strong>
          </div>

          {canEnterWaitingRoom ? (
            <Link
              className="button button-primary button-block"
              to={`/concerts/${concert.id}/waiting-room`}
            >
              {waitingRoomOpen ? 'Vào phòng chờ' : 'Mua ngay'} <span aria-hidden="true">→</span>
            </Link>
          ) : (
            <button className="button button-disabled" type="button" disabled>
              {concert.status === 'SOLD_OUT'
                ? 'Hết vé'
                : waitingRoomNotOpen
                  ? `Phòng chờ mở lúc ${waitingRoomOpenTime}`
                  : saleEnded
                    ? 'Đã kết thúc bán vé'
                    : 'Chưa mở bán'}
            </button>
          )}
          <p className="secure-note">Thanh toán bảo mật · Đối tác vé chính thức</p>
        </aside>
      </section>
      <section className="venue-section">
        <div className="page-width venue-grid">
          <div>
            <p className="eyebrow">
              <span /> Sơ đồ chỗ ngồi
            </p>
            <h2>Sơ đồ phân khu</h2>
            <p>Sơ đồ phân bổ các hạng vé trong khu vực biểu diễn của concert.</p>
          </div>
          {concert.seatMapSvg ? (
            <div
              className="concert-seat-map"
              style={{ pointerEvents: 'none' }}
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(concert.seatMapSvg, {
                  USE_PROFILES: { svg: true, svgFilters: true },
                }),
              }}
            />
          ) : (
            <div className="seat-map-fallback">
              <span aria-hidden="true">◇</span>
              <h3>Sơ đồ chỗ không khả dụng</h3>
              <p>Hệ thống chưa cập nhật sơ đồ cho buổi biểu diễn này.</p>
            </div>
          )}
        </div>
      </section>
      {relatedConcerts.length ? (
        <section className="more-events page-width">
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                <span /> Khám phá thêm
              </p>
              <h2>
                Có thể bạn cũng <em>thích.</em>
              </h2>
            </div>
            <Link className="text-link" to="/">
              Xem tất cả concert →
            </Link>
          </div>
          <div className="event-grid event-grid-three">
            {relatedConcerts.map((item) => (
              <EventCard
                key={item.id}
                event={{
                  id: item.id,
                  title: item.title,
                  venue: item.venueName,
                  eventDate: item.eventDate,
                  status: item.status,
                  image: item.posterUrl,
                }}
              />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Feature({ number, title, copy }: { number: string; title: string; copy: string }) {
  return (
    <div className="detail-feature">
      <span>{number}</span>
      <h3>{title}</h3>
      <p>{copy}</p>
    </div>
  );
}
