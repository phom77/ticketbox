import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useCountdown } from '../../hooks/useCountdown';
import './purchase.css';

/**
 * The one deadline for the current purchase step. The time itself is silent; the
 * message region below it changes, and is therefore announced, only when the
 * warning threshold is crossed and when time runs out.
 */
export function HoldTimer({
  expiresAt,
  label,
  warningSeconds = 120,
  warningMessage,
  expiredMessage,
  className,
}: {
  expiresAt?: string | null;
  label: ReactNode;
  warningSeconds?: number;
  warningMessage?: string;
  expiredMessage?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const labelId = useId();
  const countdown = useCountdown(expiresAt, warningSeconds);
  const state = countdown.isExpired ? 'expired' : countdown.isWarning ? 'warning' : undefined;
  const message =
    state === 'expired'
      ? (expiredMessage ?? t('customer:holdTimer_expiredMessage'))
      : state === 'warning'
        ? (warningMessage ??
          t('customer:holdTimer_warningMessage', { count: Math.ceil(warningSeconds / 60) }))
        : '';

  if (!expiresAt) return null;

  return (
    <div className={['hold-timer', className].filter(Boolean).join(' ')} data-state={state}>
      <div className="purchase-deadline" data-state={state}>
        <span id={labelId}>{label}</span>
        {countdown.isExpired ? (
          <strong>{t('customer:holdTimer_expired')}</strong>
        ) : (
          <strong role="timer" aria-live="off" aria-labelledby={labelId}>
            {countdown.formatted}
          </strong>
        )}
      </div>
      <p className="hold-timer-message" role="status">
        {message}
      </p>
    </div>
  );
}
