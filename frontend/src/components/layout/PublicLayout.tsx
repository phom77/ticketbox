import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, CircleUserRound, LogOut, Search, Ticket } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { getUnreadNotificationCount, isNotificationAccessDenied } from '../../api/notifications';
import { useAuth, type UserSummary } from '../../features/auth/AuthContext';
import { getRoleHome, getRoleHomeLabel } from '../../features/auth/roleRoutes';
import { buyerInformationLinks } from '../../features/ticket/buyerInformation';
import { LanguageSelect } from '../LanguageSelect';
import './PublicLayout.css';

export function Logo({
  to = '/',
  label = translate('shared:publicLayout_trangChuTicketbox'),
}: {
  to?: string;
  label?: string;
}) {
  useTranslation();
  return (
    <Link className="logo" to={to} aria-label={label}>
      <span className="logo-mark" aria-hidden="true">
        T
      </span>
      <span>
        ticket<span>box</span>
      </span>
    </Link>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function NotificationLabel({ count }: { count: number }) {
  return (
    <span className="notification-link-label">
      {translate('shared:publicLayout_thongBao')}
      {count > 0 ? (
        <>
          <span className="notification-badge" aria-hidden="true">
            {count > 99 ? '99+' : count}
          </span>
          <span className="sr-only">
            {' '}
            {translate('shared:publicLayout_thongBaoChuaDoc', { count })}
          </span>
        </>
      ) : null}
    </span>
  );
}

function WorkspaceLink({ user, close }: { user: UserSummary | null; close?: () => void }) {
  if (!user || user.role === 'AUDIENCE') return null;
  return (
    <NavLink to={getRoleHome(user.role)} onClick={close}>
      {getRoleHomeLabel(user.role)}
    </NavLink>
  );
}

function AccountMenuLinks({
  user,
  close,
  onLogout,
  unreadNotifications,
}: {
  user: UserSummary;
  close: () => void;
  onLogout: () => void;
  unreadNotifications: number;
}) {
  const location = useLocation();
  const onProfile = location.pathname === '/profile';
  const onOrders = onProfile && new URLSearchParams(location.search).get('tab') === 'orders';

  return (
    <>
      <div className="public-account-profile">
        <strong>{user.fullName}</strong>
        <small>{user.email}</small>
      </div>
      {user.role === 'AUDIENCE' ? (
        <>
          <Link
            to="/profile"
            aria-current={onProfile && !onOrders ? 'page' : undefined}
            onClick={close}
          >
            {translate('shared:publicLayout_hoSo')}
          </Link>
          <Link
            to="/profile?tab=orders"
            aria-current={onOrders ? 'page' : undefined}
            onClick={close}
          >
            {translate('shared:publicLayout_lichSuDonHang')}
          </Link>
          <NavLink to="/notifications" onClick={close}>
            <NotificationLabel count={unreadNotifications} />
          </NavLink>
        </>
      ) : (
        <WorkspaceLink user={user} close={close} />
      )}
      <button type="button" onClick={onLogout}>
        <LogOut size={17} aria-hidden="true" /> {translate('shared:publicLayout_dangXuat')}
      </button>
    </>
  );
}

function HeaderSearch({
  onSubmit,
  query,
  inputRef,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  query: string;
  inputRef?: React.RefObject<HTMLInputElement>;
}) {
  const label = translate('shared:publicLayout_timSuKien');
  return (
    <form className="public-header-search" role="search" aria-label={label} onSubmit={onSubmit}>
      <input
        ref={inputRef}
        defaultValue={query}
        type="search"
        name="q"
        maxLength={160}
        aria-label={label}
        autoComplete="off"
        placeholder={label}
      />
      <button type="submit" aria-label={translate('shared:publicLayout_timKiem')}>
        <Search aria-hidden="true" size={20} />
      </button>
    </form>
  );
}

type Disclosure = 'account' | 'search';

function PublicHeader({
  user,
  loading,
  unreadNotifications,
  logout,
}: {
  user: UserSummary | null;
  loading: boolean;
  unreadNotifications: number;
  logout: () => void;
}) {
  useTranslation();
  const [open, setOpen] = useState<Disclosure | null>(null);
  const header = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>();
  const searchInput = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const canBrowseCatalogue = !user || user.role === 'AUDIENCE' || user.role === 'ORGANIZER';
  const isAudience = user?.role === 'AUDIENCE';
  const onCatalogue = location.pathname === '/events' || location.pathname === '/events/';
  const catalogParams = new URLSearchParams(onCatalogue ? location.search : '');
  const searchQuery = catalogParams.get('q') ?? '';

  useEffect(() => {
    if (!open) return;
    if (open === 'search') searchInput.current?.focus();

    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      setOpen(null);
      trigger.current?.focus();
    }

    function dismissOutside(event: PointerEvent) {
      if (event.target instanceof Node && !header.current?.contains(event.target)) setOpen(null);
    }

    document.addEventListener('keydown', escape);
    document.addEventListener('pointerdown', dismissOutside);
    return () => {
      document.removeEventListener('keydown', escape);
      document.removeEventListener('pointerdown', dismissOutside);
    };
  }, [open]);

  function toggle(next: Disclosure, button: HTMLButtonElement) {
    trigger.current = button;
    setOpen((current) => (current === next ? null : next));
  }

  function close() {
    setOpen(null);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get('q')).trim();
    if (query) catalogParams.set('q', query);
    else catalogParams.delete('q');
    close();
    navigate({ pathname: '/events', search: catalogParams.toString(), hash: '#discover-concerts' });
  }

  return (
    <header className="public-header" ref={header}>
      <div className="public-topbar page-width">
        <Logo to={getRoleHome(user?.role)} label={getRoleHomeLabel(user?.role)} />
        <div className="public-header-actions">
          {canBrowseCatalogue ? (
            <>
              <button
                className="public-header-action public-search-trigger"
                type="button"
                aria-label={translate('shared:publicLayout_timSuKien')}
                aria-expanded={open === 'search'}
                aria-controls="public-header-search"
                onClick={(event) => toggle('search', event.currentTarget)}
              >
                <Search size={20} aria-hidden="true" />
              </button>
              <div
                id="public-header-search"
                className="public-search-panel"
                data-open={open === 'search'}
              >
                <HeaderSearch onSubmit={submitSearch} query={searchQuery} inputRef={searchInput} />
              </div>
            </>
          ) : null}
          {user ? (
            <nav
              className={isAudience ? 'public-main-nav' : 'public-main-nav public-workspace-nav'}
              aria-label={translate('shared:publicLayout_dieuHuongChinh')}
            >
              {isAudience ? (
                <NavLink to="/my-tickets" aria-label={translate('shared:publicLayout_veCuaToi')}>
                  <Ticket size={20} aria-hidden="true" />
                  <span className="public-wallet-label">
                    {translate('shared:publicLayout_veCuaToi')}
                  </span>
                  <span className="public-wallet-short-label" aria-hidden="true">
                    {translate('shared:publicLayout_veNgan')}
                  </span>
                </NavLink>
              ) : (
                <WorkspaceLink user={user} />
              )}
            </nav>
          ) : null}
          <div className="public-account">
            <button
              className="public-header-action public-account-trigger"
              type="button"
              aria-label={translate('shared:publicLayout_moMenuTaiKhoan')}
              aria-expanded={open === 'account'}
              aria-controls={open === 'account' ? 'public-account-panel' : undefined}
              aria-describedby={unreadNotifications > 0 ? 'public-unread-notifications' : undefined}
              onClick={(event) => toggle('account', event.currentTarget)}
            >
              {user ? (
                <span className="public-account-initials" aria-hidden="true">
                  {initials(user.fullName)}
                </span>
              ) : (
                <CircleUserRound size={21} aria-hidden="true" />
              )}
              <span className="public-account-name">
                {user?.fullName ?? translate('shared:publicLayout_taiKhoan')}
              </span>
              <ChevronDown className="public-account-chevron" size={16} aria-hidden="true" />
              {unreadNotifications > 0 ? (
                <>
                  <span className="notification-badge" aria-hidden="true">
                    {unreadNotifications > 99 ? '99+' : unreadNotifications}
                  </span>
                  <span className="sr-only" id="public-unread-notifications">
                    {translate('shared:publicLayout_thongBaoChuaDoc', {
                      count: unreadNotifications,
                    })}
                  </span>
                </>
              ) : null}
            </button>
            {open === 'account' ? (
              <div id="public-account-panel" className="public-account-panel public-menu-links">
                {user ? (
                  <AccountMenuLinks
                    user={user}
                    close={close}
                    onLogout={logout}
                    unreadNotifications={unreadNotifications}
                  />
                ) : !loading ? (
                  <>
                    <Link to="/login" onClick={close}>
                      {translate('shared:publicLayout_dangNhap')}
                    </Link>
                    <Link to="/register" onClick={close}>
                      {translate('shared:publicLayout_taoTaiKhoan')}
                    </Link>
                  </>
                ) : null}
                <label className="public-account-language">
                  {translate('common:language')}
                  <LanguageSelect />
                </label>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

export type PublicLayoutContext = {
  refreshUnreadNotifications: () => void;
  clearUnreadNotifications: () => void;
};

export function PublicLayout() {
  useTranslation();
  const { user, token, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const path = location.pathname.replace(/\/$/, '');
  const isBookingFlow =
    /^\/(?:concerts\/[^/]+|events\/[^/]+\/performances\/[^/]+)\/(waiting-room|seats)$/.test(path) ||
    ['/checkout', '/booking-confirmation', '/payment/result'].includes(path);

  const audienceId = user?.role === 'AUDIENCE' && !loading ? user.id : null;
  const notificationSession = useMemo(
    () => (audienceId && token ? { audienceId, token } : null),
    [audienceId, token],
  );
  const [unreadResult, setUnreadResult] = useState<{
    session: typeof notificationSession;
    count: number;
  }>();
  const unreadRequest = useRef<AbortController>();
  const unreadNotifications =
    unreadResult?.session === notificationSession ? unreadResult.count : 0;

  const refreshUnreadNotifications = useCallback(() => {
    if (!notificationSession) return;
    unreadRequest.current?.abort();
    const controller = new AbortController();
    unreadRequest.current = controller;

    void getUnreadNotificationCount(controller.signal)
      .then(({ count }) => {
        if (!controller.signal.aborted) setUnreadResult({ session: notificationSession, count });
      })
      .catch((error) => {
        if (!controller.signal.aborted && isNotificationAccessDenied(error))
          setUnreadResult(undefined);
      });
  }, [notificationSession]);

  const clearUnreadNotifications = useCallback(() => {
    unreadRequest.current?.abort();
    setUnreadResult(undefined);
  }, []);

  useEffect(() => {
    refreshUnreadNotifications();
    return () => unreadRequest.current?.abort();
  }, [refreshUnreadNotifications]);

  function logOut() {
    clearUnreadNotifications();
    logout();
    navigate('/');
  }

  return (
    <div className={isBookingFlow ? 'site-shell' : 'site-shell public-shell'}>
      <a className="skip-link" href="#main-content">
        {translate('shared:publicLayout_boQuaDenNoiDung')}
      </a>
      {isBookingFlow ? (
        <div className="page-width booking-language">
          <LanguageSelect />
        </div>
      ) : (
        <PublicHeader
          key={location.key}
          user={user}
          loading={loading}
          unreadNotifications={unreadNotifications}
          logout={logOut}
        />
      )}
      <main id="main-content" tabIndex={-1}>
        <div key={location.pathname} className="route-transition">
          <Outlet
            context={
              { refreshUnreadNotifications, clearUnreadNotifications } satisfies PublicLayoutContext
            }
          />
        </div>
      </main>
      {!isBookingFlow ? <Footer user={user} /> : null}
    </div>
  );
}

function Footer({ user }: { user: UserSummary | null }) {
  const canBrowse = !user || user.role === 'AUDIENCE' || user.role === 'ORGANIZER';

  return (
    <footer className="public-footer">
      <div className="public-footer-inner page-width">
        <div className="public-footer-brand">
          <Logo to={getRoleHome(user?.role)} label={getRoleHomeLabel(user?.role)} />
          <small>© 2026 TicketBox Vietnam</small>
        </div>
        {canBrowse || buyerInformationLinks.length > 0 ? (
          <nav aria-label={translate('shared:publicLayout_dieuHuongCuoiTrang')}>
            <ul className="footer-links">
              {canBrowse ? (
                <li>
                  <Link to="/events">{translate('shared:publicLayout_khamPhaSuKien')}</Link>
                </li>
              ) : null}
              {user?.role === 'AUDIENCE' ? (
                <>
                  <li>
                    <Link to="/profile?tab=orders">
                      {translate('shared:publicLayout_lichSuDonHang')}
                    </Link>
                  </li>
                  <li>
                    <Link to="/my-tickets">{translate('shared:publicLayout_veCuaToi')}</Link>
                  </li>
                </>
              ) : null}
              {!user ? (
                <>
                  <li>
                    <Link to="/login">{translate('shared:publicLayout_dangNhap')}</Link>
                  </li>
                  <li>
                    <Link to="/register">{translate('shared:publicLayout_taoTaiKhoan')}</Link>
                  </li>
                </>
              ) : null}
              {buyerInformationLinks.map(({ label, url }) => (
                <li key={label}>
                  <a href={url} target="_blank" rel="noreferrer">
                    {translate(label)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </div>
    </footer>
  );
}
