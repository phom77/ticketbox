import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { concertDescription, concertTitle } from '../../features/concert/concertText';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { isRequestCanceled } from '../../api/client';
import { getConcertPreview } from '../../api/publication';
import { useAuth } from '../../features/auth/AuthContext';
import {
  getConcert,
  getConcerts,
  getConcertTicketTypes,
  type ConcertDetail,
  type ConcertSummary,
  type TicketType,
} from '../../api/concerts';
import { EventCard } from '../../components/EventCard';
import { BuyerInformationLinks } from '../../components/BuyerInformationLinks';
import { RemoteImage } from '../../components/RemoteImage';
import { currency, dateFormatter } from '../../data/formatters';

export function ConcertDetailPage({ preview = false }: { preview?: boolean }) {
  useTranslation();
  const { user } = useAuth();
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
    const requests = preview
      ? Promise.all([getConcertPreview(id, controller.signal), Promise.resolve({ content: [] as ConcertSummary[] })])
      : Promise.all([getConcert(id, controller.signal), getConcerts(0, 4, controller.signal)]);
    requests
      .then(async ([detail, page]) => {
        if (!active) return;
        const currentTicketTypes = preview || detail.ticketTypes?.length
          ? detail.ticketTypes ?? []
          : await getConcertTicketTypes(detail.id, controller.signal);
        if (!active) return;
        setConcert(detail);
        setTicketTypes(currentTicketTypes);
        setRelatedConcerts(page.content.filter((item) => item.id !== detail.id).slice(0, 3));
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (active && !isRequestCanceled(requestError)) setError(translate("public:concertDetailPage_khongTheTaiConcertNay"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [id, preview, reloadKey]);

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
        <h1>{translate("public:concertDetailPage_concertKhongKhaDung")}</h1>
        <p>{error ?? translate("public:concertDetailPage_khongTimThayConcertDuocYeuCau")}</p>
        <button
          className="button button-primary"
          type="button"
          onClick={() => setReloadKey((value) => value + 1)}
        >
          {translate("public:concertDetailPage_thuLai")}
        </button>
        <Link className="text-link" to="/">
          {translate("public:concertDetailPage_quayLaiDanhSachConcert")}
        </Link>
      </div>
    );
  }

  const concertDate = new Date(concert.eventDate);
  const doorsOpen = concert.doorsOpenAt
    ? dateFormatter({ hour: '2-digit', minute: '2-digit' }).format(
        new Date(concert.doorsOpenAt),
      )
    : translate("public:concertDetailPage_seThongBao");
  const saleStartAt = new Date(concert.saleStartAt).getTime();
  const waitingRoomOpensAt = saleStartAt - 60 * 60 * 1_000;
  const saleNotStarted = saleStartAt > now;
  const waitingRoomNotOpen = waitingRoomOpensAt > now;
  const waitingRoomOpen = saleNotStarted && !waitingRoomNotOpen;
  const saleEnded = concert.saleEndAt ? new Date(concert.saleEndAt).getTime() < now : false;
  const saleStart = dateFormatter({
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(concert.saleStartAt));
  const waitingRoomOpenTime = dateFormatter({
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(waitingRoomOpensAt));
  const saleEnd = concert.saleEndAt
    ? dateFormatter({ dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(concert.saleEndAt),
      )
    : null;
  const concertDateTime = dateFormatter({
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(concertDate);
  const canBuy = !preview && (!user || user.role === 'AUDIENCE');
  const canEnterWaitingRoom = canBuy && concert.status === 'ON_SALE' && !saleEnded && !waitingRoomNotOpen;

  return (
    <>
      <section className="detail-hero">
        <RemoteImage src={concert.posterUrl ?? undefined} alt="" width="1800" height="1000" />
        <div className="detail-overlay" />
        <div className="detail-hero-content page-width">
          <Link className="back-link" to={preview ? `/organizer/concerts/${id}` : "/"}>
            {preview ? translate("public:concertDetailPage_veBuoiDien") : translate("public:concertDetailPage_tatCaConcert")}
          </Link>
          <div className="detail-title">
            <p className="eyebrow">
              <span /> {preview ? translate("public:concertDetailPage_xemTruocDanhChoBanToChuc") : translate("public:concertDetailPage_liveTaiVietNam")}
            </p>
            <h1>{concertTitle(concert)}</h1>
            <p className="artist-line">
              {concert.artistBio
                ? translate("public:concertDetailPage_gapGoNgheSiCuaDemDien")
                : translate("public:concertDetailPage_traiNghiemChinhThucTuTicketbox")}
            </p>
          </div>
          <div className="detail-facts">
            <Fact label={translate("public:concertDetailPage_ngayDien")} value={concertDateTime} />
            <Fact label={translate("public:concertDetailPage_moCua")} value={doorsOpen} />
            <Fact label={translate("public:concertDetailPage_diaDiem")} value={concert.venueName} />
          </div>
        </div>
      </section>
      <section className="detail-body page-width">
        <article className="detail-story">
          {concert.artistBio ? (
            <section className="detail-section artist-section artist-section-featured">
              <p className="eyebrow">
                <span /> {translate("public:concertDetailPage_ngheSiBieuDien")}
              </p>
              <h2>
                {translate("public:concertDetailPage_gapGoNhungNguoiDungSau")} <em>{translate("public:concertDetailPage_sanKhau")}</em>
              </h2>
              <p className="artist-biography">{concert.artistBio}</p>
            </section>
          ) : null}
          <section className="detail-section detail-about-section">
            <p className="eyebrow">
              <span /> {translate("public:concertDetailPage_veDemDien")}
            </p>
            <h2>
              {translate("public:concertDetailPage_traiNghiemLiveDuocTaoNenTu")} <em>{translate("public:concertDetailPage_amThanhAnhSangVaKetNoi")}</em>
            </h2>
            <p>{concertDescription(concert) || translate("public:concertDetailPage_motDemNhacLiveDanhChoNhung")}</p>
            <div className="feature-row">
              <Feature
                number="01"
                title={translate("public:concertDetailPage_sanXuatGiauTraiNghiem")}
                copy={translate("public:concertDetailPage_sanKhauDienAnhCungAmThanh")}
              />
              <Feature
                number="02"
                title={translate("public:concertDetailPage_veChinhThuc")}
                copy={translate("public:concertDetailPage_khuVeDaXacThuc", { arg1: ticketTypes.length })}
              />
              <Feature
                number="03"
                title={translate("public:concertDetailPage_vaoCongDeDang")}
                copy={translate("public:concertDetailPage_veMobileVaDoiNguHoTro")}
              />
            </div>
          </section>
          <section className="detail-section ticket-types-section" aria-labelledby="ticket-types-title">
            <p className="eyebrow">
              <span /> {translate("public:concertDetailPage_luaChonVe")}
            </p>
            <h2 id="ticket-types-title">
              {translate("public:concertDetailPage_chon")} <em>{translate("public:concertDetailPage_traiNghiem")}</em> {translate("public:concertDetailPage_cuaBan")}
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
                        {ticketType.availableQty > 0 ? translate("public:concertDetailPage_conVe") : translate("public:concertDetailPage_hetVe")}
                      </span>
                    </div>
                    <strong>{currency.format(ticketType.price)}</strong>
                  </div>
                ))
              ) : (
                <div className="ticket-type-empty">
                  {translate("public:concertDetailPage_cacKhuVeDangDuocChuanBi")}
                </div>
              )}
            </div>
          </section>
        </article>
        <aside className="booking-card">
          <p className="booking-label">{lowestPrice === null ? translate("public:concertDetailPage_thongTinVe") : translate("public:concertDetailPage_giaVeTu")}</p>
          <p className="booking-price">
            {lowestPrice === null ? translate("public:concertDetailPage_sapCo") : currency.format(lowestPrice)}
          </p>
          <div className="booking-divider" />
          <div className="booking-detail">
            <span>{translate("public:concertDetailPage_ngayDien")}</span>
            <strong>{concertDateTime}</strong>
          </div>
          <div className="booking-detail">
            <span>{translate("public:concertDetailPage_moBan")}</span>
            <strong>{saleStart}</strong>
          </div>
          {saleEnd ? (
            <div className="booking-detail">
              <span>{translate("public:concertDetailPage_ketThucBan")}</span>
              <strong>{saleEnd}</strong>
            </div>
          ) : null}
          <div className="booking-detail">
            <span>{translate("public:concertDetailPage_diaDiem")}</span>
            <strong>{concert.venueAddress}</strong>
          </div>
          {!preview && concert.organizationName?.trim() ? (
            <div className="booking-detail">
              <span>{translate("public:concertDetailPage_banToChuc")}</span>
              <strong>{concert.organizationName}</strong>
            </div>
          ) : null}

          {!canBuy ? (
            <p>{preview ? translate("public:concertDetailPage_cheDoXemTruoc") : translate("public:concertDetailPage_dangNhapBangTaiKhoanNguoiMua")}</p>
          ) : canEnterWaitingRoom ? (
            <Link
              className="button button-primary button-block"
              to={`/concerts/${concert.id}/waiting-room`}
            >
              {waitingRoomOpen ? translate("public:concertDetailPage_vaoPhongCho") : translate('public:concertDetailPage_buyNow')} <span aria-hidden="true">→</span>
            </Link>
          ) : (
            <button className="button button-disabled" type="button" disabled>
              {concert.status === 'SOLD_OUT'
                ? translate("public:concertDetailPage_hetVe")
                : waitingRoomNotOpen
                  ? translate("public:concertDetailPage_phongChoMoLuc", { arg1: waitingRoomOpenTime })
                  : saleEnded
                    ? translate("public:concertDetailPage_daKetThucBanVe")
                    : translate("public:concertDetailPage_chuaMoBan")}
            </button>
          )}
          <p className="secure-note">{translate("public:concertDetailPage_thanhToanBaoMatDoiTacVe")}</p>
          {!preview ? <BuyerInformationLinks /> : null}
        </aside>
      </section>
      <section className="venue-section">
        <div className="page-width venue-grid">
          <div>
            <p className="eyebrow">
              <span /> {translate("public:concertDetailPage_soDoChoNgoi")}
            </p>
            <h2>{translate("public:concertDetailPage_soDoPhanKhu")}</h2>
            <p>{translate("public:concertDetailPage_soDoPhanBoCacHangVe")}</p>
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
              <h3>{translate("public:concertDetailPage_soDoChoKhongKhaDung")}</h3>
              <p>{translate("public:concertDetailPage_heThongChuaCapNhatSoDo")}</p>
            </div>
          )}
        </div>
      </section>
      {relatedConcerts.length ? (
        <section className="more-events page-width">
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                <span /> {translate("public:concertDetailPage_khamPhaThem")}
              </p>
              <h2>
                {translate("public:concertDetailPage_coTheBanCung")} <em>{translate("public:concertDetailPage_thich")}</em>
              </h2>
            </div>
            <Link className="text-link" to="/">
              {translate("public:concertDetailPage_xemTatCaConcert")}
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
  useTranslation();
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Feature({ number, title, copy }: { number: string; title: string; copy: string }) {
  useTranslation();
  return (
    <div className="detail-feature">
      <span>{number}</span>
      <h3>{title}</h3>
      <p>{copy}</p>
    </div>
  );
}
