import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthError, AuthLayout } from '../../components/layout/AuthLayout';
import { configuredHttpsUrl } from '../../config/configuredHttpsUrl';
import { useAuth } from '../../features/auth/AuthContext';
import { authReturnPath } from '../../features/auth/authReturn';
import { getRoleHome } from '../../features/auth/roleRoutes';

const accountTermsUrl = configuredHttpsUrl(import.meta.env.VITE_ACCOUNT_TERMS_URL);
const privacyUrl = configuredHttpsUrl(import.meta.env.VITE_PRIVACY_URL);

function PolicyLink({ href, label }: { href: string | null; label: string }) {
  return href ? <a href={href} target="_blank" rel="noreferrer">{label}</a> : label;
}

export function RegisterPage() {
  useTranslation();
  const { register, user, loading } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();
  const confirmPassword = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    navigate(authReturnPath(state) ?? getRoleHome(user.role), { replace: true });
  }, [loading, navigate, state, user]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || submitting) return;
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password'));
    setError(null);
    if (password !== data.get('confirmPassword')) {
      setPasswordMismatch(true);
      confirmPassword.current?.focus();
      return;
    }
    setPasswordMismatch(false);
    setSubmitting(true);
    try {
      const email = String(data.get('email')).trim();
      await register(email, password, String(data.get('fullName')).trim(), String(data.get('phone')).trim() || null);
      navigate('/login', { state: { from: authReturnPath(state), registeredEmail: email }, replace: true });
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : translate("public:registerPage_khongTheTaoTaiKhoanCuaBan"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title={translate("public:registerPage_taoTaiKhoan")}
      description={<p>{translate("public:registerPage_taoTaiKhoanDeDatSuKien")}</p>}
    >
      <form className="auth-form" onSubmit={submit}>
        <AuthError message={error} />
        <label className="field">
          <span>{translate("public:registerPage_hoVaTen")}</span>
          <input name="fullName" autoComplete="name" required />
        </label>
        <label className="field">
          <span>{translate("public:registerPage_diaChiEmail")}</span>
          <input type="email" name="email" autoComplete="email" spellCheck={false} required />
        </label>
        <label className="field">
          <span>{translate("public:registerPage_soDienThoaiTuyChon")}</span>
          <input type="tel" name="phone" autoComplete="tel" />
        </label>
        <div className="field">
          <label htmlFor="new-account-password">{translate("public:registerPage_matKhau")}</label>
          <input
            id="new-account-password"
            type="password"
            name="password"
            autoComplete="new-password"
            aria-describedby="new-account-password-hint"
            minLength={8}
            onChange={() => setPasswordMismatch(false)}
            required
          />
          <span className="field-hint" id="new-account-password-hint">{translate("public:registerPage_itNhat8KyTu")}</span>
        </div>
        <div className="field">
          <label htmlFor="new-account-confirmation">{translate("public:registerPage_xacNhanMatKhau")}</label>
          <input
            ref={confirmPassword}
            id="new-account-confirmation"
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            aria-invalid={passwordMismatch || undefined}
            aria-describedby={passwordMismatch ? 'new-account-password-error' : undefined}
            minLength={8}
            onChange={() => setPasswordMismatch(false)}
            required
          />
          {passwordMismatch ? (
            <span className="buyer-auth-field-error" id="new-account-password-error" role="alert">
              {translate("public:registerPage_matKhauXacNhanKhongKhop")}
            </span>
          ) : null}
        </div>
        <div className="buyer-auth-checkbox">
          <input id="account-terms" type="checkbox" aria-labelledby="account-terms-label" required />
          <div id="account-terms-label">
            <label htmlFor="account-terms">{translate("public:registerPage_toiDongYVoi")}</label>{' '}
            <PolicyLink href={accountTermsUrl} label={translate("public:registerPage_dieuKhoan")} />{' '}
            {translate("public:registerPage_va")}{' '}
            <PolicyLink href={privacyUrl} label={translate("public:registerPage_chinhSachQuyenRiengTu")} />.
          </div>
        </div>
        <button className="button button-primary button-block" type="submit" disabled={loading || submitting}>
          {submitting ? translate("public:registerPage_dangTaoTaiKhoan") : translate("public:registerPage_taoTaiKhoan")}
        </button>
      </form>
      <p className="buyer-auth-alternate">
        {translate("public:registerPage_daCoTaiKhoan")}{' '}
        <Link to="/login" state={{ from: authReturnPath(state) }}>{translate("public:registerPage_dangNhap")}</Link>
      </p>
    </AuthLayout>
  );
}
