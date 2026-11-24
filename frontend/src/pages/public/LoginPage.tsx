import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthError, AuthLayout } from '../../components/layout/AuthLayout';
import { useAuth } from '../../features/auth/AuthContext';
import { authReturnPath, type AuthPageState } from '../../features/auth/authReturn';
import { getRoleHome } from '../../features/auth/roleRoutes';

export function LoginPage() {
  useTranslation();
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();
  const authState = state as AuthPageState | null;
  const returnState = { from: authReturnPath(authState) };
  const registeredEmail =
    typeof authState?.registeredEmail === 'string' ? authState.registeredEmail : '';
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    navigate(authReturnPath(state) ?? getRoleHome(user.role), { replace: true });
  }, [loading, navigate, state, user]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || submitting) return;
    const data = new FormData(event.currentTarget);
    setError(null);
    setSubmitting(true);
    try {
      await login(String(data.get('email')).trim(), String(data.get('password')));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : translate('public:loginPage_emailHoacMatKhauKhongDung'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title={translate('public:loginPage_dangNhap')}
      description={
        registeredEmail ? (
          <p role="status">{translate('public:loginPage_taiKhoanDaTao')}</p>
        ) : (
          <p>{translate('public:loginPage_dangNhapDeXemVeDonHang')}</p>
        )
      }
    >
      <form className="auth-form" onSubmit={submit}>
        <AuthError message={error} />
        <label className="field">
          <span>{translate('public:loginPage_diaChiEmail')}</span>
          <input
            type="email"
            name="email"
            defaultValue={registeredEmail}
            autoComplete="email"
            spellCheck={false}
            required
          />
        </label>
        <div className="field">
          <label htmlFor="login-password">{translate('public:loginPage_matKhau')}</label>
          <div className="password-field">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              aria-label={
                showPassword
                  ? translate('public:loginPage_anMatKhau')
                  : translate('public:loginPage_hienMatKhau')
              }
              aria-controls="login-password"
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? translate('public:loginPage_an') : translate('public:loginPage_hien')}
            </button>
          </div>
        </div>
        <Link className="buyer-auth-recovery" to="/forgot-password" state={returnState}>
          {translate('public:loginPage_quenMatKhau')}
        </Link>
        <button
          className="button button-primary button-block"
          type="submit"
          disabled={loading || submitting}
        >
          {submitting
            ? translate('public:loginPage_dangDangNhap')
            : translate('public:loginPage_dangNhap')}
        </button>
      </form>
      <p className="buyer-auth-alternate">
        {translate('public:loginPage_moiDungTicketbox')}{' '}
        <Link to="/register" state={returnState}>
          {translate('public:loginPage_taoTaiKhoan')}
        </Link>
      </p>
    </AuthLayout>
  );
}
