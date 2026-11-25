import { currency } from '../../data/formatters';

/** TicketBox charges no service fees: every buyer-facing price is the all-in price. */
export function formatPrice(amount: number) {
  return currency.format(amount);
}

export function lowestPrice(prices: Array<number | null | undefined>) {
  const valid = prices.filter(
    (price): price is number => typeof price === 'number' && Number.isFinite(price) && price >= 0,
  );
  return valid.length ? Math.min(...valid) : null;
}
