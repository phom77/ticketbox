import { useTranslation } from 'react-i18next';
import { purchasePaths } from '../../features/event/eventView';
import { AllInPriceNote } from '../../features/price/AllInPrice';
import { DetailSkeleton } from '../../components/feedback/Skeleton';
import { formatPrice, lowestPrice } from '../../features/price/price';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, MapPin } from 'lucide-react';
import DOMPurify from 'dompurify';
import { ApiClientError, isRequestCanceled } from '../../api/client';
import { getConcertPreview } from '../../api/publication';
import { useAuth } from '../../features/auth/AuthContext';
import { concertDescription, concertTitle } from '../../features/concert/concertText';
import { concertSaleState, waitingRoomLeadMs } from '../../features/concert/concertSale';
import { useOrganization } from '../../features/organizations/OrganizationProvider';
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
import { dateFormatter } from '../../data/formatters';
import './ConcertDetailPage.css';

const dateTime = dateFormatter({ dateStyle: 'medium', timeStyle: 'short' });
const doorTime = dateFormatter({ hour: '2-digit', minute: '2-digit' });
const saleLabels = {
  cancelled: 'concertDetailPage_cancelled',
  closed: 'concertDetailPage_daKetThucBanVe',
  'sold-out': 'concertDetailPage_hetVe',
  upcoming: 'concertDetailPage_chuaMoBan',
  'waiting-room': 'concertDetailPage_waitingRoomOpen',
  'on-sale': 'concertDetailPage_onSale',
} as const;

export function ConcertDetailPage({ preview = false }: { preview?: boolean }) {
  const { id } = useParams();
  const organization = useOrganization();
  const organizationId = preview ? organization?.selected?.id : null;

  return <ConcertDetailView key={JSON.stringify([id, organizationId])} id={id} preview={preview} />;
}

function ConcertDetailView({ id, preview }: { id?: string; preview: boolean }) {
  const { t } = useTranslation('public');
  const { user, loading: loadingUser } = useAuth();
  const [concert, setConcert] = useState<ConcertDetail | null>(null);
  const [ticketTypes, setTicketTypes] = useState<TicketType[] | null>(null);
  const [relatedConcerts, setRelatedConcerts] = useState<ConcertSummary[]>([]);
  const [loadError, setLoadError] = useState<'unavailable' | 'temporary' | null>(null);
  const [typesFailed, setTypesFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    const { signal } = controller;

    setLoadError(null);
    setTypesFailed(false);
    const readDetail = preview ? getConcertPreview : getConcert;
    void readDetail(id, signal)
      .then((detail) => {
        if (signal.aborted) return;
        setConcert(detail);
        setNow(Date.now());
        if (preview || detail.ticketTypes?.length) {
          setTicketTypes(detail.ticketTypes ?? []);
          return;
        }

        void getConcertTicketTypes(detail.id, signal)
          .then((items) => {
            if (!signal.aborted) setTicketTypes(items);
          })
          .catch((error: unknown) => {
            if (!signal.aborted && !isRequestCanceled(error)) setTypesFailed(true);
          });
      })
      .catch((error: unknown) => {
        if (signal.aborted || isRequestCanceled(error)) return;
        setLoadError(
          error instanceof ApiClientError && [403, 404].includes(error.status)
            ? 'unavailable'
            : 'temporary',
        );
      });

    if (!preview) {
      void getConcerts(0, 4, signal)
        .then((page) => {
          if (!signal.aborted)
            setRelatedConcerts(page.content.filter((item) => item.id !== id).slice(0, 3));
        })
        .catch(() => {
          if (!signal.aborted) setRelatedConcerts([]);
        });
    }
    return () => controller.abort();
  }, [id, preview, reloadKey]);

  useEffect(() => {
    if (!concert || concert.status !== 'ON_SALE') return;
    const times = [
      Date.parse(concert.saleStartAt) - waitingRoomLeadMs,
      Date.parse(concert.saleStartAt),
      concert.saleEndAt ? Date.parse(concert.saleEndAt) : NaN,
    ].filter((time) => time > now);
    if (!times.length) return;
    const delay = Math.max(0, Math.min(...times) - Date.now());
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(delay, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [concert, now]);

  const seatMap = useMemo(
    () =>
      concert?.seatMapSvg
        ? DOMPurify.sanitize(concert.seatMapSvg, { USE_PROFILES: { svg: true, svgFilters: true } })
        : '',
    [concert?.seatMapSvg],
  );

  const returnPath = preview
    ? id
      ? '/organizer/concerts/' + id
      : '/organizer/concerts'
    : '/events';
  const returnLabel = t(
    preview ? 'concertDetailPage_veBuoiDien' : 'concertDetailPage_tatCaConcert',
  );

  if (loadError || !id) {
    return (
      <div className="buyer-page purchase-page page-width">
        <section className="buyer-state" role="alert">
          <h1>{t('public:concertDetailPage_concertKhongKhaDung')}</h1>
          <p>
            {t(
              loadError === 'temporary'
                ? 'concertDetailPage_khongTheTaiConcertNay'
                : 'concertDetailPage_khongTimThayConcertDuocYeuCau',
            )}
          </p>
          <div className="concert-purchase-actions">
            {loadError === 'temporary' ? (
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setReloadKey((key) => key + 1)}
              >
                {t('public:concertDetailPage_thuLai')}
              </button>
            ) : null}
            <Link className="button button-secondary" to={returnPath}>
              {returnLabel}
            </Link>
          </div>
        </section>
      </div>
    );
  }

  if (!concert) {
    return (
      <div className="buyer-page purchase-page page-width">
        <DetailSkeleton label={t('public:concertDetailPage_loading')} />
      </div>
    );
  }

  const activeTypes = ticketTypes?.filter((type) => type.isActive) ?? [];
  const availableTypes = activeTypes.filter((type) => type.availableQty > 0);
  const price = lowestPrice(
    (availableTypes.length ? availableTypes : activeTypes).map((type) => type.price),
  );
  const state = concertSaleState(concert, now);
  const saleStart = Date.parse(concert.saleStartAt);
  const opensAt = saleStart - waitingRoomLeadMs;
  const canEnter =
    !preview &&
    !loadingUser &&
    (!user || user.role === 'AUDIENCE') &&
    (state === 'waiting-room' || state === 'on-sale');
  const description = concertDescription(concert);
  const displayedTypes = preview ? ticketTypes : ticketTypes && activeTypes;

  return (
    <div className="buyer-page purchase-page page-width concert-purchase-page">
      <Link className="concert-purchase-back" to={returnPath}>
        <ArrowLeft size={17} aria-hidden="true" /> {returnLabel}
      </Link>
      <div className="concert-overview">
        <header className="concert-intro">
          {concert.posterUrl ? (
            <RemoteImage src={concert.posterUrl} alt="" width={384} height={432} />
          ) : null}
          <div>
            <h1>{concertTitle(concert)}</h1>
            <p className="concert-fact">
              <CalendarDays size={19} aria-hidden="true" />
              <time dateTime={concert.eventDate}>
                {dateTime.format(new Date(concert.eventDate))}
              </time>
            </p>
            <p className="concert-fact">
              <MapPin size={19} aria-hidden="true" />
              <span>
                {concert.venueName}
                {concert.venueAddress ? <small>{concert.venueAddress}</small> : null}
              </span>
            </p>
          </div>
        </header>

        <section className="purchase-panel concert-sale-panel" aria-labelledby="concert-sale-title">
          <h2 id="concert-sale-title">{t('public:concertDetailPage_thongTinVe')}</h2>
          {preview ? (
            <p className="purchase-step">
              {t('public:concertDetailPage_xemTruocDanhChoBanToChuc')}
            </p>
          ) : null}
          <p className="concert-sale-status" role="status">
            {t(saleLabels[state])}
          </p>
          {price !== null ? (
            <p className="concert-sale-price">
              <span>{t('public:concertDetailPage_giaVeTu')}</span>{' '}
              <strong>{formatPrice(price)}</strong>
            </p>
          ) : null}
          {price !== null ? <AllInPriceNote /> : null}
          {canEnter ? (
            <Link
              className="button button-primary"
              to={purchasePaths({ id: concert.id }).waitingRoom}
            >
              {t(
                state === 'waiting-room'
                  ? 'concertDetailPage_vaoPhongCho'
                  : 'concertDetailPage_buyNow',
              )}
            </Link>
          ) : !preview && user && user.role !== 'AUDIENCE' ? (
            <p className="concert-support-copy">
              {t('public:concertDetailPage_dangNhapBangTaiKhoanNguoiMua')}
            </p>
          ) : null}
          {state === 'upcoming' && concert.status === 'ON_SALE' && Number.isFinite(opensAt) ? (
            <p className="concert-support-copy">
              {t('public:concertDetailPage_phongChoMoLuc', {
                arg1: dateTime.format(new Date(opensAt)),
              })}
            </p>
          ) : null}
          <dl className="concert-sale-facts">
            {Number.isFinite(saleStart) ? (
              <div>
                <dt>{t('public:concertDetailPage_moBan')}</dt>
                <dd>
                  <time dateTime={concert.saleStartAt}>{dateTime.format(new Date(saleStart))}</time>
                </dd>
              </div>
            ) : null}
            {concert.saleEndAt ? (
              <div>
                <dt>{t('public:concertDetailPage_ketThucBan')}</dt>
                <dd>
                  <time dateTime={concert.saleEndAt}>
                    {dateTime.format(new Date(concert.saleEndAt))}
                  </time>
                </dd>
              </div>
            ) : null}
            {concert.doorsOpenAt ? (
              <div>
                <dt>{t('public:concertDetailPage_moCua')}</dt>
                <dd>
                  <time dateTime={concert.doorsOpenAt}>
                    {doorTime.format(new Date(concert.doorsOpenAt))}
                  </time>
                </dd>
              </div>
            ) : null}
            {!preview && concert.organizationName?.trim() ? (
              <div>
                <dt>{t('public:concertDetailPage_banToChuc')}</dt>
                <dd>{concert.organizationName}</dd>
              </div>
            ) : null}
          </dl>
          {!preview ? <BuyerInformationLinks /> : null}
        </section>
      </div>

      <section className="concert-purchase-section" aria-labelledby="concert-ticket-types-title">
        <h2 id="concert-ticket-types-title">{t('public:concertDetailPage_luaChonVe')}</h2>
        {displayedTypes?.length ? (
          <ul className="purchase-panel concert-ticket-types">
            {displayedTypes.map((type) => (
              <li key={type.id}>
                <div>
                  <strong>{type.name}</strong>
                  <span className="concert-support-copy">
                    {t(
                      !type.isActive
                        ? 'concertDetailPage_ticketTypeUnavailable'
                        : state === 'sold-out' || type.availableQty <= 0
                          ? 'concertDetailPage_hetVe'
                          : state === 'cancelled' || state === 'closed'
                            ? 'concertDetailPage_ticketTypeUnavailable'
                            : 'concertDetailPage_conVe',
                    )}
                  </span>
                </div>
                <strong className="concert-type-price">{formatPrice(type.price)}</strong>
              </li>
            ))}
          </ul>
        ) : typesFailed ? (
          <div className="buyer-state" role="status">
            <p>{t('public:concertDetailPage_typesLoadFailed')}</p>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              {t('public:concertDetailPage_thuLai')}
            </button>
          </div>
        ) : (
          <p className="concert-support-copy" role={displayedTypes ? undefined : 'status'}>
            {t(
              displayedTypes
                ? 'concertDetailPage_cacKhuVeDangDuocChuanBi'
                : 'concertDetailPage_loadingTypes',
            )}
          </p>
        )}
      </section>

      {description ? (
        <section className="concert-purchase-section concert-purchase-prose">
          <h2>{t('public:concertDetailPage_veDemDien')}</h2>
          <p>{description}</p>
        </section>
      ) : null}
      {concert.artistBio ? (
        <section className="concert-purchase-section concert-purchase-prose">
          <h2>{t('public:concertDetailPage_ngheSiBieuDien')}</h2>
          <p>{concert.artistBio}</p>
        </section>
      ) : null}
      {seatMap ? (
        <section className="concert-purchase-section">
          <h2>{t('public:concertDetailPage_soDoPhanKhu')}</h2>
          <div
            className="purchase-panel concert-preview-map"
            role="img"
            aria-label={t('public:concertDetailPage_soDoPhanBoCacHangVe')}
            dangerouslySetInnerHTML={{ __html: seatMap }}
          />
        </section>
      ) : null}
      {relatedConcerts.length ? (
        <section className="concert-purchase-section">
          <h2>{t('public:concertDetailPage_khamPhaThem')}</h2>
          <div className="event-grid event-grid-three">
            {relatedConcerts.map((item) => (
              <EventCard
                key={item.id}
                event={{
                  id: item.id,
                  title: concertTitle(item),
                  venue: item.venueName,
                  eventDate: item.eventDate,
                  status: concertSaleState(item, now),
                  image: item.posterUrl,
                }}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
