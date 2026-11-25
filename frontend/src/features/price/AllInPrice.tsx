import { useTranslation } from 'react-i18next';
import { formatPrice } from './price';

/** "From ₫X" for the lowest all-in price of a set of tickets. */
export function PriceFrom({ amount, className }: { amount: number; className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={['price-from', className].filter(Boolean).join(' ')}>
      {t('shared:price_from', { price: formatPrice(amount) })}
    </span>
  );
}

/** States the all-in price convention next to a price or total. */
export function AllInPriceNote({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <p className={['all-in-price-note', className].filter(Boolean).join(' ')}>
      {t('shared:price_feesIncluded')}
    </p>
  );
}
