import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMyTransfers, type TicketTransfer } from '../../api/tickets';
import { seatDescription } from '../../features/performance/checkoutPresentation';
import { acceptedTransfersForOrder } from '../../features/ticket/transfer';
import './TicketTransfer.css';

/** Tickets from this order that the buyer gave to someone else. */
export function OrderTransfers({ orderId }: { orderId: string }) {
  const { t } = useTranslation();
  const [given, setGiven] = useState<TicketTransfer[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    getMyTransfers(controller.signal)
      .then((transfers) => {
        if (!controller.signal.aborted) setGiven(acceptedTransfersForOrder(transfers, orderId));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [orderId]);

  if (given.length === 0) return null;
  return (
    <div className="order-transfers">
      <h3>{t('customer:transferOrder_title', { count: given.length })}</h3>
      <ul>
        {given.map((transfer) => (
          <li key={transfer.id}>
            {t('customer:transferOrder_item', {
              ticket: [transfer.ticketTypeName, seatDescription(transfer)]
                .filter(Boolean)
                .join(' · '),
              name: transfer.otherPartyName,
            })}
          </li>
        ))}
      </ul>
    </div>
  );
}
