import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ApiClientError, publicApi } from '../../api/client';
import { AuthError, AuthLayout } from '../../components/layout/AuthLayout';
import { authReturnPath } from '../../features/auth/authReturn';
import { clearAuthToken } from '../../features/auth/tokenCookie';

const minimumPasswordLength = 8;
const maximumPasswordBytes = 72;

export function RequestPasswordResetPage() {
  useTranslation();
  const { state } = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const email = String(new FormData(event.currentTarget).get('email')).trim();
    setError('');
    setSubmitting(true);
    try {
      await publicApi.post('/api/auth/password-reset', { email });
      setAccepted(true);
    } catch (requestError) {
      setError(requestError instanceof ApiClientError && requestError.status === 429
        ? translate("public:passwordRecoveryPage_banDaGuiQuaNhieuYeuCau")
        : translate("public:passwordRecoveryPage_chuaTheGuiYeuCauVuiLong"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title={translate("public:passwordRecoveryPage_datLaiMatKhau")}
      description={accepted
        ? <div role="status"><p>{translate("public:passwordRecoveryPage_neuEmailDuDieuKienTicketboxSe")}</p></div>
        : <p>{translate("public:passwordRecoveryPage_nhapDiaChiEmailDungDeDang")}</p>}
    >
      {!accepted ? (
        <form className="auth-form" onSubmit={submit}>
          <AuthError message={error} />
          <label className="field">
            <span>{translate("public:passwordRecoveryPage_diaChiEmail")}</span>
            <input type="email" name="email" autoComplete="email" spellCheck={false} required />
          </label>
          <button className="button button-primary button-block" disabled={submitting} type="submit">
            {submitting ? translate("public:passwordRecoveryPage_dangGuiYeuCau") : translate("public:passwordRecoveryPage_guiLienKetDatLaiMatKhau")}
          </button>
        </form>
      ) : null}
      <p className="buyer-auth-alternate">
        <Link to="/login" state={{ from: authReturnPath(state) }}>{translate("public:passwordRecoveryPage_quayLaiDangNhap")}</Link>
      </p>
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  useTranslation();
  const [token, setToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token'));
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  const [passwordIssue, setPasswordIssue] = useState<'length' | 'mismatch' | null>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const confirmationInput = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.append(meta);
    const { pathname, search, hash } = window.location;
    if (hash) window.history.replaceState(window.history.state, '', pathname + search);
    return () => meta.remove();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || submitting) return;
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password'));
    setError('');
    if (password.length < minimumPasswordLength || !password.trim() ||
        new TextEncoder().encode(password).length > maximumPasswordBytes) {
      setPasswordIssue('length');
      passwordInput.current?.focus();
      return;
    }
    if (password !== data.get('confirmPassword')) {
      setPasswordIssue('mismatch');
      confirmationInput.current?.focus();
      return;
    }
    setPasswordIssue(null);
    setSubmitting(true);
    try {
      await publicApi.post('/api/auth/password-reset/confirm', { token, password });
      setToken(null);
      clearAuthToken();
      setComplete(true);
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 429) {
        setError(translate("public:passwordRecoveryPage_banDaGuiQuaNhieuYeuCau"));
      } else if (requestError instanceof ApiClientError && requestError.status < 500) {
        setToken(null);
      } else {
        setError(translate("public:passwordRecoveryPage_chuaTheXacNhanKetQuaBan"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (complete) {
    return (
      <AuthLayout
        title={translate("public:passwordRecoveryPage_matKhauDaDuocCapNhat")}
        description={<p role="status">{translate("public:passwordRecoveryPage_dangNhapBangMatKhauMoiDe")}</p>}
      >
        <Link className="button button-primary button-block" to="/login" reloadDocument>{translate("public:passwordRecoveryPage_dangNhap")}</Link>
      </AuthLayout>
    );
  }

  if (!token) {
    return (
      <AuthLayout
        title={translate("public:passwordRecoveryPage_lienKetKhongKhaDung")}
        description={<p role="status">{translate("public:passwordRecoveryPage_lienKetDatLaiMatKhauKhong")}</p>}
      >
        <Link className="button button-primary button-block" to="/forgot-password">{translate("public:passwordRecoveryPage_yeuCauLienKetMoi")}</Link>
        <p className="buyer-auth-alternate"><Link to="/login">{translate("public:passwordRecoveryPage_quayLaiDangNhap")}</Link></p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={translate("public:passwordRecoveryPage_taoMatKhauMoi")}
      description={<p id="reset-password-policy">{translate("public:passwordRecoveryPage_dungItNhat8KyTuVa")}</p>}
    >
      <form className="auth-form" onSubmit={submit}>
        <AuthError message={error} />
        <div className="field">
          <label htmlFor="reset-password">{translate("public:passwordRecoveryPage_matKhauMoi")}</label>
          <input
            id="reset-password"
            ref={passwordInput}
            type="password"
            name="password"
            autoComplete="new-password"
            aria-describedby={passwordIssue === 'length' ? 'reset-password-length-error' : 'reset-password-policy'}
            aria-invalid={passwordIssue === 'length' || undefined}
            minLength={minimumPasswordLength}
            onChange={() => setPasswordIssue(null)}
            required
          />
          {passwordIssue === 'length' ? (
            <span className="buyer-auth-field-error" id="reset-password-length-error" role="alert">
              {translate("public:passwordRecoveryPage_matKhauPhaiCoItNhat8")}
            </span>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="reset-confirmation">{translate("public:passwordRecoveryPage_xacNhanMatKhauMoi")}</label>
          <input
            id="reset-confirmation"
            ref={confirmationInput}
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            aria-describedby={passwordIssue === 'mismatch' ? 'reset-password-confirmation-error' : undefined}
            aria-invalid={passwordIssue === 'mismatch' || undefined}
            minLength={minimumPasswordLength}
            onChange={() => setPasswordIssue(null)}
            required
          />
          {passwordIssue === 'mismatch' ? (
            <span className="buyer-auth-field-error" id="reset-password-confirmation-error" role="alert">
              {translate("public:passwordRecoveryPage_matKhauXacNhanKhongKhop")}
            </span>
          ) : null}
        </div>
        <button className="button button-primary button-block" disabled={submitting} type="submit">
          {submitting ? translate("public:passwordRecoveryPage_dangLuuMatKhau") : translate("public:passwordRecoveryPage_luuMatKhauMoi")}
        </button>
      </form>
      <p className="buyer-auth-alternate"><Link to="/login">{translate("public:passwordRecoveryPage_quayLaiDangNhap")}</Link></p>
    </AuthLayout>
  );
}
