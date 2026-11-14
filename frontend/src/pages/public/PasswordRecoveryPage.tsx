import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useLayoutEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ApiClientError, publicApi } from '../../api/client';
import { Logo } from '../../components/layout/PublicLayout';
import { LanguageSelect } from '../../components/LanguageSelect';
import { clearAuthToken } from '../../features/auth/tokenCookie';

const minimumPasswordLength = 8;
const maximumPasswordBytes = 72;

function RecoveryLayout({ children }: { children: ReactNode }) {
  useTranslation();
  return (
    <main className="auth-recovery">
      <div className="auth-card">
        <div className="auth-language"><LanguageSelect /></div>
        <Logo />
        {children}
      </div>
    </main>
  );
}

export function RequestPasswordResetPage() {
  useTranslation();
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
    <RecoveryLayout>
      <div className="auth-heading">
        <h1>{translate("public:passwordRecoveryPage_datLaiMatKhau")}</h1>
        {accepted ? (
          <p role="status">{translate("public:passwordRecoveryPage_neuEmailDuDieuKienTicketboxSe")}</p>
        ) : (
          <p>{translate("public:passwordRecoveryPage_nhapDiaChiEmailDungDeDang")}</p>
        )}
      </div>
      {error ? <div className="state-panel auth-error" role="alert"><p>{error}</p></div> : null}
      {!accepted ? (
        <form className="auth-form" onSubmit={submit}>
          <label className="field">
            <span>{translate("public:passwordRecoveryPage_diaChiEmail")}</span>
            <input type="email" name="email" autoComplete="email" spellCheck={false} required />
          </label>
          <button className="button button-primary button-block" disabled={submitting} type="submit">
            {submitting ? translate("public:passwordRecoveryPage_dangGuiYeuCau") : translate("public:passwordRecoveryPage_guiLienKetDatLaiMatKhau")}
          </button>
        </form>
      ) : null}
      <p className="auth-switch"><Link to="/login">{translate("public:passwordRecoveryPage_quayLaiDangNhap")}</Link></p>
    </RecoveryLayout>
  );
}

export function ResetPasswordPage() {
  useTranslation();
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
      setError(translate("public:passwordRecoveryPage_matKhauPhaiCoItNhat8"));
      return;
    }
    if (password !== data.get('confirmPassword')) {
      setError(translate("public:passwordRecoveryPage_matKhauXacNhanKhongKhop"));
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
      <RecoveryLayout>
        <div className="auth-heading" role="status">
          <h1>{translate("public:passwordRecoveryPage_matKhauDaDuocCapNhat")}</h1>
          <p>{translate("public:passwordRecoveryPage_dangNhapBangMatKhauMoiDe")}</p>
        </div>
        <Link className="button button-primary button-block" to="/login" reloadDocument>{translate("public:passwordRecoveryPage_dangNhap")}</Link>
      </RecoveryLayout>
    );
  }

  if (!token) {
    return (
      <RecoveryLayout>
        <div className="auth-heading" role="status">
          <h1>{translate("public:passwordRecoveryPage_lienKetKhongKhaDung")}</h1>
          <p>{translate("public:passwordRecoveryPage_lienKetDatLaiMatKhauKhong")}</p>
        </div>
        <Link className="button button-primary button-block" to="/forgot-password">{translate("public:passwordRecoveryPage_yeuCauLienKetMoi")}</Link>
        <p className="auth-switch"><Link to="/login">{translate("public:passwordRecoveryPage_quayLaiDangNhap")}</Link></p>
      </RecoveryLayout>
    );
  }

  return (
    <RecoveryLayout>
      <div className="auth-heading">
        <h1>{translate("public:passwordRecoveryPage_taoMatKhauMoi")}</h1>
        <p id="reset-password-policy">{translate("public:passwordRecoveryPage_dungItNhat8KyTuVa")}</p>
      </div>
      {error ? <div className="state-panel auth-error" role="alert"><p>{error}</p></div> : null}
      <form className="auth-form" onSubmit={submit}>
        <label className="field">
          <span>{translate("public:passwordRecoveryPage_matKhauMoi")}</span>
          <input type="password" name="password" autoComplete="new-password"
            aria-describedby="reset-password-policy" minLength={minimumPasswordLength} required />
        </label>
        <label className="field">
          <span>{translate("public:passwordRecoveryPage_xacNhanMatKhauMoi")}</span>
          <input type="password" name="confirmPassword" autoComplete="new-password"
            minLength={minimumPasswordLength} required />
        </label>
        <button className="button button-primary button-block" disabled={submitting} type="submit">
          {submitting ? translate("public:passwordRecoveryPage_dangLuuMatKhau") : translate("public:passwordRecoveryPage_luuMatKhauMoi")}
        </button>
      </form>
      <p className="auth-switch"><Link to="/login">{translate("public:passwordRecoveryPage_quayLaiDangNhap")}</Link></p>
    </RecoveryLayout>
  );
}
