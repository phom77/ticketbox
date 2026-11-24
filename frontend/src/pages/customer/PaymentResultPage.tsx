import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { isRequestCanceled } from '../../api/client';
import type { Order } from '../../api/orders';
import { clearPendingPayment } from '../../features/ticket/checkoutPayment';
import { pollOrderOutcome, type OrderSnapshot } from '../../features/ticket/orderOutcome';
import { CheckoutStatusPanel } from './CheckoutDetails';

const resultCopy = {
  checking: {
    title: 'customer:orderOutcome_confirmingTitle',
    body: 'customer:orderOutcome_checkingBody',
    canCheckOrder: true,
  },
  waiting: {
    title: 'customer:orderOutcome_confirmingTitle',
    body: 'customer:orderOutcome_waitingBody',
    canCheckOrder: true,
  },
  verifying: {
    title: 'customer:orderOutcome_confirmingTitle',
    body: 'customer:orderOutcome_verifyingBody',
    canCheckOrder: true,
  },
  expired: {
    title: 'customer:orderOutcome_expiredTitle',
    body: 'customer:orderOutcome_checkHistoryBody',
    canCheckOrder: false,
  },
  expiredPending: {
    title: 'customer:orderOutcome_deadlinePassedTitle',
    body: 'customer:orderOutcome_expiredPendingBody',
    canCheckOrder: false,
  },
  closed: {
    title: 'customer:orderOutcome_closedTitle',
    body: 'customer:orderOutcome_checkHistoryBody',
    canCheckOrder: false,
  },
  review: {
    title: 'customer:orderOutcome_reviewTitle',
    body: 'customer:orderOutcome_reviewBody',
    canCheckOrder: false,
  },
  unavailable: {
    title: 'customer:orderOutcome_unavailableTitle',
    body: 'customer:orderOutcome_unavailableBody',
    canCheckOrder: true,
  },
  missing: {
    title: 'customer:orderOutcome_missingTitle',
    body: 'customer:orderOutcome_missingBody',
    canCheckOrder: false,
  },
} as const;

type Result = keyof typeof resultCopy;

type ResultStep =
  | { kind: 'confirmed' }
  | { kind: 'checkout'; failed: boolean }
  | { kind: 'show'; result: Result }
  | { kind: 'wait'; result: Result };

/** Maps the shared order outcome to this page's screens; `wait` keeps polling. */
function resultStep({ outcome, payment }: OrderSnapshot, awaitingSession: boolean): ResultStep {
  switch (outcome.kind) {
    case 'paid':
      return { kind: 'confirmed' };
    case 'failed':
      return { kind: 'checkout', failed: true };
    case 'verifying':
      return { kind: 'wait', result: 'verifying' };
    case 'payable':
      // A session that was still being created can be continued from checkout.
      return awaitingSession &&
        (payment?.attemptState === 'CREATED' ||
          (payment?.attemptState === 'READY' && payment.paymentUrl))
        ? { kind: 'checkout', failed: false }
        : { kind: 'wait', result: 'waiting' };
    default:
      return { kind: 'show', result: outcome.kind };
  }
}

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
      try {
        // The provider's browser return identifies the order. Only the order API confirms it was paid.
        const final = await pollOrderOutcome(id, {
          attempts: 15,
          intervalMs: 2_000,
          signal,
          onSnapshot: ({ order }) =>
            setVerifiedOrder({ id: order.id, referenceCode: order.referenceCode }),
          isFinal: (snapshot) => {
            const step = resultStep(snapshot, awaitingSession);
            if (step.kind === 'wait') setResult(step.result);
            return step.kind !== 'wait';
          },
        });
        if (signal.aborted) return;
        if (!final) {
          setResult('unavailable');
          return;
        }
        if (final.outcome.settled) clearPendingPayment(final.order.id);
        const step = resultStep(final, awaitingSession);
        if (step.kind === 'confirmed') {
          navigate('/booking-confirmation', { replace: true, state: { orderId: final.order.id } });
        } else if (step.kind === 'checkout') {
          navigate(step.failed ? `${checkout}&payment=failed` : checkout, { replace: true });
        } else {
          setResult(step.result);
        }
      } catch (error) {
        if (!signal.aborted && !isRequestCanceled(error)) setResult('unavailable');
      }
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
      step="checkout"
    >
      <div className="purchase-status-actions">
        {canCheckOrder && (
          <Link className="button button-primary" to={checkOrderPath}>
            {t('customer:orderOutcome_returnToPayment')}
          </Link>
        )}
        <Link
          className={canCheckOrder ? 'button button-secondary' : 'button button-primary'}
          to="/profile?tab=orders"
        >
          {t('customer:orderOutcome_viewOrderHistory')}
        </Link>
      </div>
    </CheckoutStatusPanel>
  );
}
