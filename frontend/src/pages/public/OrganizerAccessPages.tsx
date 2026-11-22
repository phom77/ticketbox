import { useLayoutEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router-dom';
import { api, publicApi } from '../../api/client';
import { AuthError, AuthLayout } from '../../components/layout/AuthLayout';
import { useAuth } from '../../features/auth/AuthContext';

function usePrivateToken() {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token'));
  useLayoutEffect(() => {
    if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname);
  }, []);
  return token;
}

export function OrganizerApplicationPage() {
  const { t } = useTranslation();
  const token = usePrivateToken();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !token) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await publicApi.post('/api/auth/organizer/application', { ...Object.fromEntries(data), token });
      setSent(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('shared:partnerUnavailable'));
    } finally {
      setBusy(false);
    }
  }

  if (!token) return <Navigate to="/" replace />;

  return <AuthLayout title={t('shared:partnerApplication')}>
    <AuthError message={error} />
    {sent ? <p role="status">{t('shared:partnerApplicationSent')}</p> : null}
    {token && !sent ? <form className="auth-form" onSubmit={submit}>
      <label className="field">{t('shared:partnerOrganization')}<input name="organizationName" required maxLength={160} autoComplete="organization" /></label>
      <label className="field">{t('shared:partnerManager')}<input name="managerName" required maxLength={160} autoComplete="name" /></label>
      <label className="field">{t('shared:partnerEmail')}<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
      <label className="field">{t('shared:partnerFirstEvent')}<textarea name="firstEvent" required maxLength={1000} rows={4} /></label>
      <button className="button button-primary" disabled={busy}>{t('shared:partnerSubmit')}</button>
    </form> : null}
  </AuthLayout>;
}

export function OrganizerActivationPage() {
  const { t } = useTranslation();
  const { user, loading, logout } = useAuth();
  const token = usePrivateToken();
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  const canAccept = user?.role === 'ORGANIZER';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api.post('/api/auth/organizer/activate', {
        token, name: data.get('name') || null, password: data.get('password') || null,
      });
      if (user && !canAccept) await logout();
      setComplete(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('shared:partnerUnavailable'));
    } finally {
      setBusy(false);
    }
  }

  if (!token) return <Navigate to="/" replace />;

  return <AuthLayout title={t('shared:partnerActivate')}>
    <AuthError message={error} />
    {complete ? <>
      <p role="status">{t('shared:partnerActivated')}</p>
      <Link className="button button-primary" to={canAccept ? '/organizer' : '/login'}>{t(canAccept ? 'shared:roleRoutes_khongGianNhaToChuc' : 'public:loginPage_dangNhap')}</Link>
    </> : null}
    {token && !complete && !loading ? <form className="auth-form" onSubmit={submit}>
      {!canAccept ? <>
        <label className="field">{t('shared:partnerMemberName')}<input name="name" autoComplete="name" maxLength={160} /></label>
        <label className="field">{t('public:registerPage_matKhau')}<input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} /></label>
      </> : <p>{user.fullName} · {user.email}</p>}
      <button className="button button-primary" disabled={busy}>{t(canAccept ? 'shared:partnerAccept' : 'shared:partnerActivate')}</button>
      {!user ? <Link to="/login" state={{ from: { pathname: '/partner/activate', hash: '#token=' + token } }}>{t('shared:partnerExistingSignIn')}</Link> : null}
      {user ? <button type="button" className="button button-secondary" onClick={() => void logout()}>{t('shared:operationsLayout_dangXuat')}</button> : null}
    </form> : null}
  </AuthLayout>;
}
