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
        <h1>{expired ? 'Đơn hàng đã hết hạn' : 'Chưa thể xác nhận đơn hàng'}</h1>
        <p>Kiểm tra trạng thái mới nhất trong lịch sử đơn hàng trước khi đặt vé lại.</p>
        <div className="confirmation-actions">
          <Link className="button button-primary" to="/profile?tab=orders">
            Xem lịch sử đơn hàng
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="confirmation-page page-width" aria-live="polite">
      <div className="confirmation-mark">✓</div>
      <p className="eyebrow">
        <span /> Đặt vé thành công
      </p>
      <h1>
        Bạn sẽ tham dự <em>{event.title}.</em>
      </h1>
      <p>Thanh toán đã được xác nhận. Bạn có thể xem vé trong mục Vé của tôi.</p>
      <div className="confirmation-ticket">
        <RemoteImage src={event.image ?? undefined} alt="" width="360" height="240" />
        <div>
          <span>
            Đơn {order.id.slice(0, 8).toUpperCase()}
          </span>
          <h2>{event.title}</h2>
          <p>{eventDate.format(new Date(event.date))}</p>
          <p>{event.venue}</p>
        </div>
        <div className="mini-qr" aria-label="Minh họa mã QR vé">
          <i />
          <i />
          <i />
        </div>
      </div>
      <div className="confirmation-actions">
        <Link className="button button-primary" to="/my-tickets">
          Xem vé của tôi
        </Link>
        <Link className="button button-secondary" to="/">
          Khám phá thêm sự kiện
        </Link>
      </div>
    </section>
  );
}
