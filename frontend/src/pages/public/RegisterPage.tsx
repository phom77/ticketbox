import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthContext';
import { getRoleHome } from '../../features/auth/roleRoutes';
import { AuthLayout } from './LoginPage';

export function RegisterPage() {
  useTranslation();
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
      setError(translate("public:registerPage_matKhauXacNhanKhongKhop"));
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
        requestError instanceof Error ? requestError.message : translate("public:registerPage_khongTheTaoTaiKhoanCuaBan"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      quote={translate("public:registerPage_amThanhKhanGiaRatLonKy")}
      credit={translate("public:registerPage_ticketboxTuyenChonHaNoi")}
    >
      <div className="auth-card">
        <div className="auth-heading">
          <p className="eyebrow">
            <span /> {translate("public:registerPage_thamGiaCungKhanGia")}
          </p>
          <h1>
            {translate("public:registerPage_danhChoCho")} <em>{translate("public:registerPage_nhieuKyUcHon")}</em>
          </h1>
          <p>{translate("public:registerPage_taoTaiKhoanDeDatSuKien")}</p>
        </div>
        {error ? (
          <div className="state-panel auth-error" role="alert">
            <p>{error}</p>
          </div>
        ) : null}
        <form className="auth-form" onSubmit={submit}>
          <label className="field">
            <span>{translate("public:registerPage_hoVaTen")}</span>
            <input name="fullName" autoComplete="name" placeholder="Minh Quan..." required />
          </label>
          <div className="form-grid form-grid-two">
            <label className="field">
              <span>{translate("public:registerPage_diaChiEmail")}</span>
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
              <span>{translate("public:registerPage_soDienThoai")}</span>
              <input type="tel" name="phone" autoComplete="tel" placeholder="0901234567" required />
            </label>
          </div>
          <div className="form-grid form-grid-two">
            <label className="field">
              <span>{translate("public:registerPage_matKhau")}</span>
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                minLength={8}
                placeholder={translate("public:registerPage_itNhat8KyTu")}
                required
              />
            </label>
            <label className="field">
              <span>{translate("public:registerPage_xacNhanMatKhau")}</span>
              <input
                type="password"
                name="confirmPassword"
                autoComplete="new-password"
                minLength={8}
                placeholder={translate("public:registerPage_nhapLaiMatKhau")}
                required
              />
            </label>
          </div>
          <label className="terms-check">
            <input type="checkbox" required />
            <span>
              {translate("public:registerPage_toiDongYVoi")} <a href="#terms">{translate("public:registerPage_dieuKhoan")}</a> {translate("public:registerPage_va")}{' '}
              <a href="#privacy">{translate("public:registerPage_chinhSachQuyenRiengTu")}</a>.
            </span>
          </label>
          <button
            className="button button-primary button-block"
            type="submit"
            disabled={submitting}
          >
            {submitting ? translate("public:registerPage_dangTaoTaiKhoan") : translate("public:registerPage_taoTaiKhoan")}
          </button>
        </form>
        <p className="auth-switch">
          {translate("public:registerPage_daCoTaiKhoan")} <Link to="/login">{translate("public:registerPage_dangNhap")}</Link>
        </p>
      </div>
    </AuthLayout>
  );
}
