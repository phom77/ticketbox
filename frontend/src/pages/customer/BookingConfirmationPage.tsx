import { Link, useLocation, useSearchParams } from 'react-router-dom';
import type { Order } from '../../api/orders';
import { RemoteImage } from '../../components/RemoteImage';
import { eventDate } from '../../data/formatters';
import { events } from '../../data/demoEvents';
import type { CheckoutState } from './CheckoutPage';

type ConfirmationState = Partial<CheckoutState> & {
  order?: Order;
};

export function BookingConfirmationPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const failed = searchParams.get('status') === 'failed';
  const state = location.state as ConfirmationState | null;
  const mockEvent = events[0];
  const event = state?.event ?? {
    id: String(mockEvent.id),
    title: mockEvent.title,
    venue: mockEvent.venue,
    date: mockEvent.date,
    image: mockEvent.image,
  };

  if (failed) {
    return (
      <section className="confirmation-page page-width" aria-live="polite">
        <div className="confirmation-mark failed">!</div>
        <p className="eyebrow">
          <span /> Thanh toán chưa thành công
        </p>
        <h1>
          Vé của bạn vẫn đang <em>chờ.</em>
        </h1>
        <p>
          Không thể hoàn tất thanh toán. Chưa có khoản phí nào được ghi nhận. Hãy thử lại hoặc kiểm
          tra lịch sử đơn hàng.
        </p>
        <div className="confirmation-actions">
          {state?.selection?.length ? (
            <Link
              className="button button-primary"
              to="/checkout"
              state={{ event, selection: state.selection }}
            >
              Thử thanh toán lại
            </Link>
          ) : null}
          <Link className="button button-secondary" to="/profile">
            Xem đơn hàng
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
      <p>Thanh toán đã được xác nhận và vé của bạn đã sẵn sàng.</p>
      <div className="confirmation-ticket">
        <RemoteImage src={event.image ?? undefined} alt="" width="360" height="240" />
        <div>
          <span>
            {state?.order ? `Đơn ${state.order.id.slice(0, 8).toUpperCase()}` : 'Đơn đã xác nhận'}
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
