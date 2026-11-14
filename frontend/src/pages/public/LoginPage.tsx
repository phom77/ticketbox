import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from '../../components/layout/PublicLayout';
import { events } from '../../data/demoEvents';
import { useAuth } from '../../features/auth/AuthContext';
import { getRoleHome } from '../../features/auth/roleRoutes';
import { LanguageSelect } from '../../components/LanguageSelect';

export function LoginPage() {
  useTranslation();
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      navigate(getRoleHome(user.role), { replace: true });
    }
  }, [loading, navigate, user]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);
    setSubmitting(true);
    try {
      const loggedInUser = await login(String(data.get('email')), String(data.get('password')));
      const requestedPath = (location.state as { from?: { pathname?: string } } | null)?.from
        ?.pathname;
      navigate(requestedPath ?? getRoleHome(loggedInUser.role), { replace: true });
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : translate("public:loginPage_emailHoacMatKhauKhongDung"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      quote={translate("public:loginPage_coNhungDemDienTroThanhMot")}
      credit={translate("public:loginPage_ticketboxTuyenChonSaiGon")}
    >
      <div className="auth-card">
        <div className="auth-heading">
          <p className="eyebrow">
            <span /> {translate("public:loginPage_chaoMungTroLai")}
          </p>
          <h1>
            {translate("public:loginPage_demDienTiepTheoCuaBan")} <em>{translate("public:loginPage_batDauTaiDay")}</em>
          </h1>
          <p>{translate("public:loginPage_dangNhapDeXemVeDonHang")}</p>
        </div>
        {error ? (
          <div className="state-panel auth-error" role="alert">
            <p>{error}</p>
          </div>
        ) : null}
        <form className="auth-form" onSubmit={submit}>
          <label className="field">
            <span>{translate("public:loginPage_diaChiEmail")}</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              spellCheck={false}
              placeholder="ban@example.com..."
              required
            />
          </label>
          <label className="field">
            <span>{translate("public:loginPage_matKhau")}</span>
            <span className="password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                placeholder={translate("public:loginPage_matKhauCuaBan")}
                required
              />
              <button
                type="button"
                aria-label={showPassword ? translate("public:loginPage_anMatKhau") : translate("public:loginPage_hienMatKhau")}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? translate("public:loginPage_an") : translate("public:loginPage_hien")}
              </button>
            </span>
          </label>
          <div className="form-meta">
            <label>
              <input type="checkbox" name="remember" /> {translate("public:loginPage_ghiNhoToi")}
            </label>
            <Link to="/forgot-password">{translate("public:loginPage_quenMatKhau")}</Link>
          </div>
          <button
            className="button button-primary button-block"
            type="submit"
            disabled={submitting}
          >
            {submitting ? translate("public:loginPage_dangDangNhap") : translate("public:loginPage_dangNhap")}
          </button>
          <button className="google-button" type="button" disabled aria-disabled="true">
            <span>G</span> {translate("public:loginPage_chuaHoTroDangNhapGoogle")}
          </button>
        </form>
        <p className="auth-switch">
          {translate("public:loginPage_moiDungTicketbox")} <Link to="/register">{translate("public:loginPage_taoTaiKhoan")}</Link>
        </p>
      </div>
    </AuthLayout>
  );
}

export function AuthLayout({
  children,
  quote,
  credit,
}: {
  children: React.ReactNode;
  quote: string;
  credit: string;
}) {
  useTranslation();
  return (
    <main className="auth-layout">
      <section className="auth-visual">
        <img src={events[2].image} alt="" width="1200" height="1500" />
        <div className="auth-visual-overlay" />
        <div className="auth-logo">
          <Logo />
        </div>
        <blockquote>
          “{quote}”<cite>{credit}</cite>
        </blockquote>
      </section>
      <section className="auth-content">
        <div className="auth-language"><LanguageSelect /></div>
        {children}
      </section>
    </main>
  );
}
