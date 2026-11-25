import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './purchase.css';

export type PurchaseStep = 'date' | 'tickets' | 'checkout' | 'done';

const steps: Array<{ id: PurchaseStep; label: string }> = [
  { id: 'date', label: 'customer:purchaseProgress_chooseDate' },
  { id: 'tickets', label: 'customer:purchaseProgress_tickets' },
  { id: 'checkout', label: 'customer:purchaseProgress_checkout' },
  { id: 'done', label: 'customer:purchaseProgress_done' },
];

/** The four buyer purchase steps, with the current one marked for assistive technology. */
export function PurchaseProgress({ current }: { current: PurchaseStep }) {
  const { t } = useTranslation();
  const index = steps.findIndex((step) => step.id === current);

  return (
    <div className="purchase-progress">
      <p className="purchase-step">
        {t('customer:purchaseProgress_stepOf', {
          current: index + 1,
          total: steps.length,
          step: t(steps[index].label),
        })}
      </p>
      <ol aria-label={t('customer:purchaseProgress_label')}>
        {steps.map((step, position) => {
          const state = position < index ? 'complete' : position === index ? 'current' : 'upcoming';
          return (
            <li
              key={step.id}
              data-state={state}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span className="purchase-progress-marker" aria-hidden="true">
                {state === 'complete' ? <Check size={14} strokeWidth={3} /> : position + 1}
              </span>
              <span className="purchase-progress-label">{t(step.label)}</span>
              {state === 'complete' ? (
                <span className="sr-only"> {t('customer:purchaseProgress_completed')}</span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
