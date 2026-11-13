import { useLayoutEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ApiClientError, publicApi } from '../../api/client';
import { Logo } from '../../components/layout/PublicLayout';
import { clearAuthToken } from '../../features/auth/tokenCookie';

const minimumPasswordLength = 8;
const maximumPasswordBytes = 72;

function RecoveryLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-recovery" lang="vi">
      <div className="auth-card">
        <Logo />
        {children}
      </div>
    </main>
  );
}

export function RequestPasswordResetPage() {
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
        ? 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.'
        : 'Chưa thể gửi yêu cầu. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RecoveryLayout>
      <div className="auth-heading">
        <h1>Đặt lại mật khẩu</h1>
        {accepted ? (
          <p role="status">Nếu email đủ điều kiện, TicketBox sẽ gửi hướng dẫn đặt lại mật khẩu.</p>
        ) : (
          <p>Nhập địa chỉ email dùng để đăng nhập TicketBox.</p>
        )}
      </div>
      {error ? <div className="state-panel auth-error" role="alert"><p>{error}</p></div> : null}
      {!accepted ? (
        <form className="auth-form" onSubmit={submit}>
          <label className="field">
            <span>Địa chỉ email</span>
            <input type="email" name="email" autoComplete="email" spellCheck={false} required />
          </label>
          <button className="button button-primary button-block" disabled={submitting} type="submit">
            {submitting ? 'Đang gửi yêu cầu…' : 'Gửi liên kết đặt lại mật khẩu'}
          </button>
        </form>
      ) : null}
      <p className="auth-switch"><Link to="/login">Quay lại đăng nhập</Link></p>
    </RecoveryLayout>
  );
}

export function ResetPasswordPage() {
  const [token, setToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token'));
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');

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
    if (password.length < minimumPasswordLength || !password.trim() ||
        new TextEncoder().encode(password).length > maximumPasswordBytes) {
      setError('Mật khẩu phải có ít nhất 8 ký tự và không vượt quá 72 byte.');
      return;
    }
    if (password !== data.get('confirmPassword')) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await publicApi.post('/api/auth/password-reset/confirm', { token, password });
      setToken(null);
      clearAuthToken();
      setComplete(true);
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 429) {
        setError('Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.');
      } else if (requestError instanceof ApiClientError && requestError.status < 500) {
        setToken(null);
      } else {
        setError('Chưa thể xác nhận kết quả. Bạn có thể thử lại hoặc kiểm tra bằng cách đăng nhập.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (complete) {
    return (
      <RecoveryLayout>
        <div className="auth-heading" role="status">
          <h1>Mật khẩu đã được cập nhật</h1>
          <p>Đăng nhập bằng mật khẩu mới để tiếp tục.</p>
        </div>
        <Link className="button button-primary button-block" to="/login" reloadDocument>Đăng nhập</Link>
      </RecoveryLayout>
    );
  }

  if (!token) {
    return (
      <RecoveryLayout>
        <div className="auth-heading" role="status">
          <h1>Liên kết không khả dụng</h1>
          <p>Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.</p>
        </div>
        <Link className="button button-primary button-block" to="/forgot-password">Yêu cầu liên kết mới</Link>
        <p className="auth-switch"><Link to="/login">Quay lại đăng nhập</Link></p>
      </RecoveryLayout>
    );
  }

  return (
    <RecoveryLayout>
      <div className="auth-heading">
        <h1>Tạo mật khẩu mới</h1>
        <p id="reset-password-policy">Dùng ít nhất 8 ký tự và không vượt quá 72 byte.</p>
      </div>
      {error ? <div className="state-panel auth-error" role="alert"><p>{error}</p></div> : null}
      <form className="auth-form" onSubmit={submit}>
        <label className="field">
          <span>Mật khẩu mới</span>
          <input type="password" name="password" autoComplete="new-password"
            aria-describedby="reset-password-policy" minLength={minimumPasswordLength} required />
        </label>
        <label className="field">
          <span>Xác nhận mật khẩu mới</span>
          <input type="password" name="confirmPassword" autoComplete="new-password"
            minLength={minimumPasswordLength} required />
        </label>
        <button className="button button-primary button-block" disabled={submitting} type="submit">
          {submitting ? 'Đang lưu mật khẩu…' : 'Lưu mật khẩu mới'}
        </button>
      </form>
      <p className="auth-switch"><Link to="/login">Quay lại đăng nhập</Link></p>
    </RecoveryLayout>
  );
}
