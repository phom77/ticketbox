import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { isRequestCanceled } from '../../api/client';
import { getOrder, getPaymentStatus, type Order } from '../../api/orders';
import {
  clearPendingPayment,
  orderWindowExpired,
  paymentNeedsReview,
  paymentStillVerifying,
} from '../../features/ticket/checkoutPayment';
import { CheckoutStatusPanel } from './CheckoutDetails';

const resultCopy = {
  checking: {
    title: 'customer:paymentResultPage_confirming',
    body: 'customer:paymentResultPage_dangXacNhanThanhToanCuaBan',
    canCheckOrder: true,
  },
  waiting: {
    title: 'customer:paymentResultPage_confirming',
    body: 'customer:paymentResultPage_daNhanKetQuaTuCongThanh',
    canCheckOrder: true,
  },
  verifying: {
    title: 'customer:paymentResultPage_confirming',
    body: 'customer:paymentResultPage_congThanhToanChuaTraKetQua',
    canCheckOrder: true,
  },
  expired: {
    title: 'customer:bookingConfirmationPage_donHangDaHetHan',
    body: 'customer:bookingConfirmationPage_kiemTraTrangThaiMoiNhatTrong',
    canCheckOrder: false,
  },
  expiredPending: {
    title: 'customer:paymentResultPage_deadlinePassed',
    body: 'customer:paymentResultPage_expiredPending',
    canCheckOrder: false,
  },
  closed: {
    title: 'customer:paymentResultPage_orderClosed',
    body: 'customer:bookingConfirmationPage_kiemTraTrangThaiMoiNhatTrong',
    canCheckOrder: false,
  },
  review: {
    title: 'customer:paymentResultPage_reviewHeading',
    body: 'customer:paymentResultPage_reviewBody',
    canCheckOrder: false,
  },
  unavailable: {
    title: 'customer:paymentResultPage_unavailable',
    body: 'customer:paymentResultPage_chuaTheXacNhanTrangThaiThanh',
    canCheckOrder: true,
  },
  missing: {
    title: 'customer:paymentResultPage_khongTheKhopThanhToanNayVoi',
    body: 'customer:paymentResultPage_moLichSuDonHangDeKiem',
    canCheckOrder: false,
  },
} as const;

type Result = keyof typeof resultCopy;

export function PaymentResultPage() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('orderId') ?? searchParams.get('vnp_TxnRef');
  return (
    <PaymentResult
      key={orderId}
      orderId={orderId}
      awaitingSession={searchParams.get('pending') === 'true'}
    />
  );
}

function PaymentResult({
  orderId,
  awaitingSession,
}: {
  orderId: string | null;
  awaitingSession: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [result, setResult] = useState<Result>(orderId ? 'checking' : 'missing');
  const [verifiedOrder, setVerifiedOrder] = useState<Pick<Order, 'id' | 'referenceCode'>>();

  useEffect(() => {
    if (!orderId) return;

    const controller = new AbortController();
    const { signal } = controller;
    const checkout = `/checkout?orderId=${encodeURIComponent(orderId)}`;

    async function confirmPayment(id: string) {
      for (let attempt = 0; attempt < 15 && !signal.aborted; attempt += 1) {
        try {
          const paymentRequest = getPaymentStatus(id, signal).catch(() => null);
          const order = await getOrder(id, signal);
          if (signal.aborted) return;
          setVerifiedOrder({ id: order.id, referenceCode: order.referenceCode });

          // The provider's browser return identifies the order. Only the order API confirms it was paid.
          if (order.status === 'PAID') {
            clearPendingPayment(order.id);
            navigate('/booking-confirmation', { replace: true, state: { orderId: order.id } });
            return;
          }

          const expired = orderWindowExpired(order);
          const payment = await paymentRequest;
          if (signal.aborted) return;
          if (!payment) {
            setResult(expired ? 'expiredPending' : 'unavailable');
            return;
          }
          const verifying = paymentStillVerifying(payment.attemptState);
          if (expired) {
            if (!verifying) clearPendingPayment(order.id);
            setResult(verifying ? 'expiredPending' : 'expired');
            return;
          }
          if (paymentNeedsReview(payment.attemptState)) {
            setResult('review');
            return;
          }
          if (order.status !== 'AWAITING_PAYMENT') {
            if (!verifying) clearPendingPayment(order.id);
            setResult(verifying ? 'review' : 'closed');
            return;
          }
          if (payment.attemptState === 'FAILED') {
            navigate(`${checkout}&payment=failed`, { replace: true });
            return;
          }
          if (
            awaitingSession &&
            (payment.attemptState === 'CREATED' ||
              (payment.attemptState === 'READY' && payment.paymentUrl))
          ) {
            navigate(checkout, { replace: true });
            return;
          }

          setResult(verifying ? 'verifying' : 'waiting');
          await new Promise((resolve) => window.setTimeout(resolve, 2_000));
        } catch (error) {
          if (!signal.aborted && !isRequestCanceled(error)) setResult('unavailable');
          return;
        }
      }

      if (!signal.aborted) setResult('unavailable');
    }

    void confirmPayment(orderId);
    return () => controller.abort();
  }, [navigate, orderId, awaitingSession]);

  const copy = resultCopy[result];
  const checkOrderPath = orderId ? '/checkout?orderId=' + encodeURIComponent(orderId) : null;
  const canCheckOrder = copy.canCheckOrder && checkOrderPath && verifiedOrder?.id;
  return (
    <CheckoutStatusPanel
      announce
      title={t(copy.title)}
      body={t(copy.body)}
      referenceCode={verifiedOrder?.referenceCode}
    >
      <div className="purchase-status-actions">
        {canCheckOrder && (
          <Link className="button button-primary" to={checkOrderPath}>
            {t('customer:paymentResultPage_quayLaiDonThanhToan')}
          </Link>
        )}
        <Link
          className={canCheckOrder ? 'button button-secondary' : 'button button-primary'}
          to="/profile?tab=orders"
        >
          {t('customer:paymentResultPage_xemLichSuDonHang')}
        </Link>
      </div>
    </CheckoutStatusPanel>
  );
}
