import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AlertTriangle, ImageOff, Mail, Phone } from 'lucide-react';
import { api } from '../../api/client';
import type { PaymentProvider } from '../../api/orders';
import { useAuth } from '../../features/auth/AuthContext';
import { termsUrl } from '../../features/ticket/buyerInformation';
import { CheckoutEventTime } from './CheckoutDetails';

const providerNames: Record<PaymentProvider, string> = {
  MOCK: 'Demo',
  VNPAY: 'VNPAY',
  MOMO: 'MoMo',
};

const providerName = (provider: PaymentProvider) => providerNames[provider];

/** A simple text mark for a payment provider; no external image is loaded. */
export function ProviderMark({ provider }: { provider: PaymentProvider }) {
  const text = provider === 'VNPAY' ? 'VNPAY' : provider === 'MOMO' ? 'mo' : 'TB';
  return (
    <span className="provider-mark" data-provider={provider} aria-hidden="true">
      {text}
    </span>
  );
}

export type PaymentChoice = { value: PaymentProvider; title: string; copy: string };

export function PaymentMethodCards({
  options,
  selected,
  locked,
  disabled,
  labelledBy,
  onSelect,
}: {
  options: PaymentChoice[];
  selected: PaymentProvider | null;
  locked: PaymentProvider | null;
  disabled: boolean;
  labelledBy: string;
  onSelect: (provider: PaymentProvider) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="purchase-payment-options" role="radiogroup" aria-labelledby={labelledBy}>
        {options.map((option) => (
          <label
            className="purchase-payment-option"
            data-selected={selected === option.value || undefined}
            key={option.value}
          >
            <input
              type="radio"
              name="payment"
              value={option.value}
              checked={selected === option.value}
              onChange={() => onSelect(option.value)}
              disabled={disabled || (locked !== null && option.value !== locked)}
            />
            <ProviderMark provider={option.value} />
            <span>
              <strong>{option.title}</strong>
              <small>{option.copy}</small>
            </span>
          </label>
        ))}
      </div>
      {selected && selected !== 'MOCK' && (
        <p className="purchase-method-note">
          {t('customer:checkout2_redirectNote', { provider: providerName(selected) })}
        </p>
      )}
      {locked && <p className="purchase-method-note">{t('customer:checkout2_lockedNote')}</p>}
    </>
  );
}

type PhoneState =
  | { status: 'loading' }
  | { status: 'ready'; phone: string | null }
  | { status: 'error' };

function useProfilePhone(): PhoneState {
  const [state, setState] = useState<PhoneState>({ status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    void api
      .get<unknown, { phone: string | null }>('/api/users/me/profile', {
        signal: controller.signal,
      })
      .then((profile) => {
        if (!controller.signal.aborted) setState({ status: 'ready', phone: profile.phone });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      });
    return () => controller.abort();
  }, []);
  return state;
}

/** Where the tickets go: the account email and phone, edited in the account page. */
export function ContactSection({ titleId }: { titleId: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const phone = useProfilePhone();
  return (
    <section className="purchase-panel purchase-contact" aria-labelledby={titleId}>
      <h2 id={titleId}>{t('customer:checkout2_contactTitle')}</h2>
      <dl className="purchase-contact-list">
        <div>
          <dt>
            <Mail size={18} aria-hidden="true" />
            {t('customer:checkout2_email')}
          </dt>
          <dd>{user?.email}</dd>
        </div>
        <div>
          <dt>
            <Phone size={18} aria-hidden="true" />
            {t('customer:checkout2_phone')}
          </dt>
          <dd>
            {phone.status === 'loading'
              ? t('customer:checkout2_phoneLoading')
              : phone.status === 'error'
                ? t('customer:checkout2_phoneError')
                : (phone.phone ?? t('customer:checkout2_phoneMissing'))}
          </dd>
        </div>
      </dl>
      <p className="purchase-method-note">
        {t('customer:checkout2_ticketsSentTo', { email: user?.email ?? '' })}{' '}
        <Link to="/profile">{t('customer:checkout2_editInAccount')}</Link>
      </p>
    </section>
  );
}

/** Terms acceptance; rendered only when a terms URL is configured. */
export function TermsConsent({
  accepted,
  invalid,
  onChange,
}: {
  accepted: boolean;
  invalid: boolean;
  onChange: (accepted: boolean) => void;
}) {
  const { t } = useTranslation();
  if (!termsUrl) return null;
  return (
    <div className="purchase-terms">
      <label>
        <input
          type="checkbox"
          checked={accepted}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? 'checkout-terms-error' : undefined}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>
          {t('customer:checkout2_termsPrefix')}{' '}
          <a href={termsUrl} target="_blank" rel="noreferrer">
            {t('shared:buyerInformation_dieuKienMuaVaHoanVe')}
          </a>
        </span>
      </label>
      {invalid && (
        <p id="checkout-terms-error" role="alert" className="purchase-field-error">
          {t('customer:checkout2_termsRequired')}
        </p>
      )}
    </div>
  );
}

/** Poster thumbnail, title, date and venue at the top of an order summary. */
export function SummaryEvent({
  title,
  poster,
  date,
  venue,
}: {
  title: string;
  poster: string | null;
  date?: string;
  venue?: string;
}) {
  return (
    <div className="purchase-summary-event">
      {poster ? (
        <img src={poster} alt="" loading="lazy" />
      ) : (
        <span className="purchase-summary-poster-empty" aria-hidden="true">
          <ImageOff size={22} />
        </span>
      )}
      <div>
        <h3>{title}</h3>
        <CheckoutEventTime date={date} venue={venue} />
      </div>
    </div>
  );
}

export function PaymentFailedBanner({
  provider,
  children,
}: {
  provider: PaymentProvider | null;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="purchase-panel purchase-failed" role="alert">
      <AlertTriangle size={24} aria-hidden="true" />
      <div>
        <h2>{t('customer:checkout2_failedTitle')}</h2>
        <p>
          {provider
            ? t('customer:checkout2_failedBody', { provider: providerName(provider) })
            : t('customer:checkout2_failedBodyGeneric')}
        </p>
        {children}
      </div>
    </div>
  );
}
