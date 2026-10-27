import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from '../../components/layout/PublicLayout';
import { events } from '../../data/demoEvents';
import { useAuth } from '../../features/auth/AuthContext';
import { getRoleHome } from '../../features/auth/roleRoutes';

export function LoginPage() {
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
        requestError instanceof Error ? requestError.message : 'Email hoặc mật khẩu không đúng.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      quote="Có những đêm diễn trở thành một phần của bạn."
      credit="TicketBox tuyển chọn · Sài Gòn"
    >
      <div className="auth-card">
        <div className="auth-heading">
          <p className="eyebrow">
            <span /> Chào mừng trở lại
          </p>
          <h1>
            Đêm diễn tiếp theo của bạn <em>bắt đầu tại đây.</em>
          </h1>
          <p>Đăng nhập để xem vé, đơn hàng và hồ sơ đã lưu.</p>
        </div>
        {error ? (
          <div className="state-panel auth-error" role="alert">
            <p>{error}</p>
          </div>
        ) : null}
        <form className="auth-form" onSubmit={submit}>
          <label className="field">
            <span>Địa chỉ email</span>
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
            <span>Mật khẩu</span>
            <span className="password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                placeholder="Mật khẩu của bạn..."
                required
              />
              <button
                type="button"
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? 'Ẩn' : 'Hiện'}
              </button>
            </span>
          </label>
          <div className="form-meta">
            <label>
              <input type="checkbox" name="remember" /> Ghi nhớ tôi
            </label>
            <a href="#forgot-password">Quên mật khẩu?</a>
          </div>
          <button
            className="button button-primary button-block"
            type="submit"
            disabled={submitting}
          >
            {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
          <button className="google-button" type="button" disabled aria-disabled="true">
            <span>G</span> Chưa hỗ trợ đăng nhập Google
          </button>
        </form>
        <p className="auth-switch">
          Mới dùng TicketBox? <Link to="/register">Tạo tài khoản</Link>
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
      <section className="auth-content">{children}</section>
    </main>
  );
}
