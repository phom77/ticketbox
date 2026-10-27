import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthContext';
import { getRoleHome } from '../../features/auth/roleRoutes';
import { AuthLayout } from './LoginPage';

export function RegisterPage() {
  const { register, user, loading } = useAuth();
  const navigate = useNavigate();
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
    const password = String(data.get('password'));
    const confirmation = String(data.get('confirmPassword'));
    if (password !== confirmation) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await register(
        String(data.get('email')),
        password,
        String(data.get('fullName')),
        String(data.get('phone')),
      );
      navigate('/login', { replace: true });
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Không thể tạo tài khoản của bạn.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      quote="Âm thanh khán giả rất lớn. Ký ức còn vang hơn."
      credit="TicketBox tuyển chọn · Hà Nội"
    >
      <div className="auth-card">
        <div className="auth-heading">
          <p className="eyebrow">
            <span /> Tham gia cùng khán giả
          </p>
          <h1>
            Dành chỗ cho <em>nhiều ký ức hơn.</em>
          </h1>
          <p>Tạo tài khoản để đặt sự kiện và lưu mọi vé trong tầm tay.</p>
        </div>
        {error ? (
          <div className="state-panel auth-error" role="alert">
            <p>{error}</p>
          </div>
        ) : null}
        <form className="auth-form" onSubmit={submit}>
          <label className="field">
            <span>Họ và tên</span>
            <input name="fullName" autoComplete="name" placeholder="Minh Quan..." required />
          </label>
          <div className="form-grid form-grid-two">
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
              <span>Số điện thoại</span>
              <input type="tel" name="phone" autoComplete="tel" placeholder="0901234567" required />
            </label>
          </div>
          <div className="form-grid form-grid-two">
            <label className="field">
              <span>Mật khẩu</span>
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                minLength={8}
                placeholder="Ít nhất 8 ký tự..."
                required
              />
            </label>
            <label className="field">
              <span>Xác nhận mật khẩu</span>
              <input
                type="password"
                name="confirmPassword"
                autoComplete="new-password"
                minLength={8}
                placeholder="Nhập lại mật khẩu..."
                required
              />
            </label>
          </div>
          <label className="terms-check">
            <input type="checkbox" required />
            <span>
              Tôi đồng ý với <a href="#terms">Điều khoản</a> và{' '}
              <a href="#privacy">Chính sách quyền riêng tư</a>.
            </span>
          </label>
          <button
            className="button button-primary button-block"
            type="submit"
            disabled={submitting}
          >
            {submitting ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}
          </button>
        </form>
        <p className="auth-switch">
          Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
        </p>
      </div>
    </AuthLayout>
  );
}
