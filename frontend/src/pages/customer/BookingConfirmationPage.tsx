import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { concertTitle } from '../../features/concert/concertText';
import { Link, useLocation } from 'react-router-dom';
import type { Order } from '../../api/orders';
import { RemoteImage } from '../../components/RemoteImage';
import { eventDate } from '../../data/formatters';
import type { CheckoutEvent } from './CheckoutPage';

type ConfirmationState = {
  event?: CheckoutEvent;
  order?: Order;
};

export function BookingConfirmationPage() {
  useTranslation();
  const location = useLocation();
  const state = location.state as ConfirmationState | null;
  const order = state?.order;
  const event = state?.event;

  if (!event || order?.status !== 'PAID') {
    const expired = order?.status === 'EXPIRED' || (
      order?.status === 'AWAITING_PAYMENT' && new Date(order.expiresAt).getTime() <= Date.now()
    );
    return (
      <section className="confirmation-page page-width" aria-live="polite">
        <div className="confirmation-mark failed">!</div>
        <h1>{expired ? translate("customer:bookingConfirmationPage_donHangDaHetHan") : translate("customer:bookingConfirmationPage_chuaTheXacNhanDonHang")}</h1>
        <p>{translate("customer:bookingConfirmationPage_kiemTraTrangThaiMoiNhatTrong")}</p>
        <div className="confirmation-actions">
          <Link className="button button-primary" to="/profile?tab=orders">
            {translate("customer:bookingConfirmationPage_xemLichSuDonHang")}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="confirmation-page page-width" aria-live="polite">
      <div className="confirmation-mark">✓</div>
      <p className="eyebrow">
        <span /> {translate("customer:bookingConfirmationPage_datVeThanhCong")}
      </p>
      <h1>
        {translate("customer:bookingConfirmationPage_banSeThamDu")} <em>{concertTitle(event)}.</em>
      </h1>
      <p>{translate("customer:bookingConfirmationPage_thanhToanDaDuocXacNhanBan")}</p>
      <div className="confirmation-ticket">
        <RemoteImage src={event.image ?? undefined} alt="" width="360" height="240" />
        <div>
          <span>
            {translate("customer:bookingConfirmationPage_don")} {order.id.slice(0, 8).toUpperCase()}
          </span>
          <h2>{concertTitle(event)}</h2>
          <p>{eventDate.format(new Date(event.date))}</p>
          <p>{event.venue}</p>
        </div>
        <div className="mini-qr" aria-label={translate("customer:bookingConfirmationPage_minhHoaMaQrVe")}>
          <i />
          <i />
          <i />
        </div>
      </div>
      <div className="confirmation-actions">
        <Link className="button button-primary" to="/my-tickets">
          {translate("customer:bookingConfirmationPage_xemVeCuaToi")}
        </Link>
        <Link className="button button-secondary" to="/">
          {translate("customer:bookingConfirmationPage_khamPhaThemSuKien")}
        </Link>
      </div>
    </section>
  );
}
