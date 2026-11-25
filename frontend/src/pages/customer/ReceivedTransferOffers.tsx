import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getMyTransfers, type TicketTransfer } from '../../api/tickets';
import { dateFormatter } from '../../data/formatters';
import { pendingReceivedOffers } from '../../features/ticket/transfer';
import './TicketTransfer.css';

const dateTime = dateFormatter({ dateStyle: 'medium', timeStyle: 'short' });

/** Open ticket offers from other people, shown above the wallet so they are acted on first. */
export function ReceivedTransferOffers() {
  const { t } = useTranslation();
  const [offers, setOffers] = useState<TicketTransfer[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    getMyTransfers(controller.signal)
      .then((transfers) => {
        if (!controller.signal.aborted) setOffers(pendingReceivedOffers(transfers, Date.now()));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  if (offers.length === 0) return null;
  return (
    <section className="transfer-offers" aria-labelledby="transfer-offers-title">
      <h2 id="transfer-offers-title">
        {t('customer:transferOffers_title', { count: offers.length })}
      </h2>
      <ul>
        {offers.map((offer) => (
          <li key={offer.id}>
            <span>
              <strong>
                {t('customer:transferOffers_item', {
                  name: offer.otherPartyName,
                  event: offer.concertTitle,
                })}
              </strong>
              <small>
                {t('customer:transferOffers_expires', {
                  date: dateTime.format(new Date(offer.expiresAt)),
                })}
              </small>
            </span>
            <Link
              className="button button-primary"
              to={`/my-tickets/transfers/${encodeURIComponent(offer.id)}`}
            >
              {t('customer:transferOffers_review')}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
