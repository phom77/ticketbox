import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
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
  useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [messageKey, setMessageKey] = useState('customer:paymentResultPage_dangXacNhanThanhToanCuaBan');
  const orderId = searchParams.get('orderId') ?? searchParams.get('vnp_TxnRef');
  const awaitingSession = searchParams.get('pending') === 'true';

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
          translations: concert.translations,
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
          navigate('/profile?tab=orders', { replace: true });
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

          // The browser return locates the order. Settlement uses the server's verified state.
          if (order.status === 'PAID') {
            await finish(order, false);
            return;
          }

          if (payment.attemptState === 'RECONCILIATION_REQUIRED' || payment.attemptState === 'REVIEW_REQUIRED') {
            setMessageKey('customer:paymentResultPage_reconciliationRequired');
            return;
          }
          if (awaitingSession && (payment.attemptState === 'CREATED' || (payment.attemptState === 'READY' && payment.paymentUrl))) {
            resumePayment(false);
            return;
          }
          if (!isOrderStillPayable(order) &&
              (payment.attemptState === 'UNKNOWN' || payment.attemptState === 'PROCESSING')) {
            setMessageKey("customer:paymentResultPage_donDaHetThoiGianGiuVe");
            return;
          }
          if (!isOrderStillPayable(order)) {
            await finish(order, true);
            return;
          }

          if (payment.attemptState === 'FAILED') {
            resumePayment(true);
            return;
          }

          setMessageKey(payment.attemptState === 'UNKNOWN' || payment.attemptState === 'PROCESSING'
            ? 'customer:paymentResultPage_congThanhToanChuaTraKetQua'
            : 'customer:paymentResultPage_daNhanKetQuaTuCongThanh');
          await new Promise((resolve) => window.setTimeout(resolve, 2_000));
        } catch (requestError) {
          if (active && !isRequestCanceled(requestError)) {
            setMessageKey("customer:paymentResultPage_chuaTheXacNhanTrangThaiThanh");
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
  }, [navigate, orderId, awaitingSession]);

  if (!orderId) {
    return (
      <section className="confirmation-page page-width">
        <div className="confirmation-mark failed">!</div>
        <p className="eyebrow"><span /> {translate("customer:paymentResultPage_khongCoKetQuaThanhToan")}</p>
        <h1>{translate("customer:paymentResultPage_khongTheKhopThanhToanNayVoi")}</h1>
        <p>{translate("customer:paymentResultPage_moLichSuDonHangDeKiem")}</p>
        <Link className="button button-primary" to="/profile?tab=orders">{translate("customer:paymentResultPage_xemDonHang")}</Link>
      </section>
    );
  }

  return (
    <section className="confirmation-page page-width" aria-live="polite">
      <div className="payment-result-spinner" aria-hidden="true" />
      <p className="eyebrow"><span /> {translate("customer:paymentResultPage_dangXuLyThanhToan")}</p>
      <h1>{translate("customer:paymentResultPage_vuiLongChoChungToiDangXac")}</h1>
      <p>{translate(messageKey, { orderId })}</p>
      <div className="confirmation-actions">
        <Link className="text-link" to={`/checkout?orderId=${encodeURIComponent(orderId)}`}>
          {translate("customer:paymentResultPage_quayLaiDonThanhToan")}
        </Link>
        <Link className="text-link" to="/profile?tab=orders">{translate("customer:paymentResultPage_xemLichSuDonHang")}</Link>
      </div>
    </section>
  );
}
