import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { isRequestCanceled } from '../../api/client';
import { getConcert } from '../../api/concerts';
import { getOrder, getPaymentStatus, type Order } from '../../api/orders';
import { PENDING_PAYMENT_STORAGE_KEY, type CheckoutEvent } from './CheckoutPage';
import type { CheckoutSelection } from './SeatSelectionPage';

function isOrderStillPayable(order: Order) {
  return order.status === 'AWAITING_PAYMENT' && new Date(order.expiresAt).getTime() > Date.now();
}

export function PaymentResultPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState('Đang xác nhận thanh toán của bạn với TicketBox...');
  const orderId = searchParams.get('orderId') ?? searchParams.get('vnp_TxnRef');
  const isVnpayFailure =
    searchParams.has('vnp_ResponseCode') && searchParams.get('vnp_ResponseCode') !== '00';
  const isMomoFailure = searchParams.has('resultCode') && searchParams.get('resultCode') !== '0';
  const awaitingSession = searchParams.get('pending') === 'true';
  const providerReportedFailure = isVnpayFailure || isMomoFailure;

  useEffect(() => {
    const activeOrderId = orderId ?? '';
    if (!activeOrderId) return;

    const controller = new AbortController();
    let active = true;

    function resumePayment(showFailure: boolean) {
      const failureQuery = showFailure ? '&payment=failed' : '';
      navigate(`/checkout?orderId=${encodeURIComponent(activeOrderId)}${failureQuery}`, { replace: true });
    }

    async function finish(order: Order, failed: boolean) {
      try {
        const concert = await getConcert(order.concertId, controller.signal);
        if (!active) return;
        const event: CheckoutEvent = {
          id: concert.id,
          title: concert.title,
          venue: concert.venueName,
          date: concert.eventDate,
          image: concert.posterUrl,
        };
        const selection: CheckoutSelection[] = order.items.map((item) => ({
          id: item.ticketTypeId,
          name: item.ticketTypeName,
          price: item.unitPrice,
          quantity: item.quantity,
        }));
        sessionStorage.removeItem(PENDING_PAYMENT_STORAGE_KEY);
        navigate(`/booking-confirmation${failed ? '?status=failed' : ''}`, {
          replace: true,
          state: { event, selection, order },
        });
      } catch (requestError) {
        if (active && !isRequestCanceled(requestError)) {
          navigate('/profile', { replace: true });
        }
      }
    }

    async function confirmPayment() {
      for (let attempt = 0; attempt < 15 && active; attempt += 1) {
        try {
          const [order, payment] = await Promise.all([
            getOrder(activeOrderId, controller.signal), getPaymentStatus(activeOrderId, controller.signal),
          ]);
          if (!active) return;

          // Server status and gateway webhook are authoritative. A browser return code
          // is only a hint; payment can still be confirmed asynchronously.
          if (order.status === 'PAID') {
            await finish(order, false);
            return;
          }

          if (payment.attemptState === 'RECONCILIATION_REQUIRED' || payment.attemptState === 'REVIEW_REQUIRED') {
            setMessage('Thanh toán cần được đối soát. Mã đơn: ' + activeOrderId + '. Vui lòng liên hệ hỗ trợ trước khi thanh toán lại.');
            return;
          }
          if (awaitingSession && (payment.attemptState === 'CREATED' || (payment.attemptState === 'READY' && payment.paymentUrl))) {
            resumePayment(false);
            return;
          }
          if (!isOrderStillPayable(order) &&
              (payment.attemptState === 'UNKNOWN' || payment.attemptState === 'PROCESSING')) {
            setMessage('Đơn đã hết thời gian giữ vé. Kết quả thanh toán vẫn đang được đối soát; hãy kiểm tra lịch sử đơn hàng trước khi mua lại.');
            return;
          }
          if (!isOrderStillPayable(order)) {
            await finish(order, true);
            return;
          }

          if (payment.attemptState === 'FAILED' ||
              (providerReportedFailure && payment.attemptState !== 'UNKNOWN' && payment.attemptState !== 'PROCESSING')) {
            resumePayment(true);
            return;
          }

          setMessage(payment.attemptState === 'UNKNOWN' || payment.attemptState === 'PROCESSING'
            ? 'Cổng thanh toán chưa trả kết quả rõ ràng. TicketBox đang kiểm tra phiên này; vui lòng chờ trước khi thanh toán lại.'
            : 'Đã nhận kết quả từ cổng thanh toán. Đang chờ TicketBox xác nhận đơn hàng...');
          await new Promise((resolve) => window.setTimeout(resolve, 2_000));
        } catch (requestError) {
          if (active && !isRequestCanceled(requestError)) {
            setMessage('Chưa thể xác nhận trạng thái thanh toán. Bạn có thể mở lại đơn một cách an toàn.');
          }
          return;
        }
      }

      if (active) {
        // The provider may still deliver its webhook later. Keep the order resumable
        // instead of treating a slow callback as a failed purchase.
        resumePayment(false);
      }
    }

    void confirmPayment();
    return () => {
      active = false;
      controller.abort();
    };
  }, [navigate, orderId, providerReportedFailure, awaitingSession]);

  if (!orderId) {
    return (
      <section className="confirmation-page page-width">
        <div className="confirmation-mark failed">!</div>
        <p className="eyebrow"><span /> Không có kết quả thanh toán</p>
        <h1>Không thể khớp thanh toán này với đơn hàng.</h1>
        <p>Mở lịch sử đơn hàng để kiểm tra trạng thái thanh toán mới nhất.</p>
        <Link className="button button-primary" to="/profile">Xem đơn hàng</Link>
      </section>
    );
  }

  return (
    <section className="confirmation-page page-width" aria-live="polite">
      <div className="payment-result-spinner" aria-hidden="true" />
      <p className="eyebrow"><span /> Đang xử lý thanh toán</p>
      <h1>Vui lòng chờ, chúng tôi đang xác nhận đơn hàng của bạn.</h1>
      <p>{message}</p>
      <div className="confirmation-actions">
        <Link className="text-link" to={`/checkout?orderId=${encodeURIComponent(orderId)}`}>
          Quay lại đơn thanh toán
        </Link>
        <Link className="text-link" to="/profile">Xem lịch sử đơn hàng</Link>
      </div>
    </section>
  );
}
