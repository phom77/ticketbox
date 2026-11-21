import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, LogOut, Menu, Search, Ticket } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { getUnreadNotificationCount, isNotificationAccessDenied } from '../../api/notifications';
import { useAuth, type UserSummary } from '../../features/auth/AuthContext';
import { getRoleHome, getRoleHomeLabel } from '../../features/auth/roleRoutes';
import { buyerInformationLinks } from '../../features/ticket/buyerInformation';
import { LanguageSelect } from '../LanguageSelect';
import './PublicLayout.css';

export function Logo({ to = '/', label = translate("shared:publicLayout_trangChuTicketbox") }: { to?: string; label?: string }) {
  useTranslation();
  return (
    <Link className="logo" to={to} aria-label={label}>
      <span className="logo-mark" aria-hidden="true">T</span>
      <span>ticket<span>box</span></span>
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
      {translate("shared:publicLayout_thongBao")}
      {count > 0 ? (
        <>
          <span className="notification-badge" aria-hidden="true">{count > 99 ? '99+' : count}</span>
          <span className="sr-only"> {translate("shared:publicLayout_thongBaoChuaDoc", { count })}</span>
        </>
      ) : null}
    </span>
  );
}

function WorkspaceLink({ user, close }: { user: UserSummary | null; close?: () => void }) {
  if (!user || user.role === 'AUDIENCE') return null;
  return <NavLink to={getRoleHome(user.role)} onClick={close}>{getRoleHomeLabel(user.role)}</NavLink>;
}

function AccountMenuLinks({
  user,
  close,
  onLogout,
  children,
}: {
  user: UserSummary;
  close: () => void;
  onLogout: () => void;
  children?: React.ReactNode;
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
      {children}
      {user.role === 'AUDIENCE' ? (
        <>
          <Link to="/profile" aria-current={onProfile && !onOrders ? 'page' : undefined} onClick={close}>
            {translate("shared:publicLayout_hoSo")}
          </Link>
          <Link to="/profile?tab=orders" aria-current={onOrders ? 'page' : undefined} onClick={close}>
            {translate("shared:publicLayout_lichSuDonHang")}
          </Link>
        </>
      ) : null}
      {user.role !== 'ORGANIZER' ? (
        <Link to="/organizer" onClick={close}>{translate("shared:publicLayout_khongGianNhaToChuc")}</Link>
      ) : null}
      <button type="button" onClick={onLogout}>
        <LogOut size={17} aria-hidden="true" /> {translate("shared:publicLayout_dangXuat")}
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
  const label = translate("shared:publicLayout_timSuKien");
  return (
    <form className="public-header-search" role="search" aria-label={label} onSubmit={onSubmit}>
      <input
        ref={inputRef}
        defaultValue={query}
        type="search"
        name="q"
        aria-label={label}
        autoComplete="off"
        placeholder={label}
      />
      <button type="submit" aria-label={label}>
        <Search aria-hidden="true" size={20} />
      </button>
    </form>
  );
}

type Disclosure = 'account' | 'menu' | 'search';

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
  const mobileSearch = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const canBrowseCatalogue = !user || user.role === 'AUDIENCE' || user.role === 'ORGANIZER';
  const isAudience = user?.role === 'AUDIENCE';
  const catalogParams = new URLSearchParams(location.pathname === '/' ? location.search : '');
  const searchQuery = catalogParams.get('q') ?? '';

  useEffect(() => {
    if (!open) return;
    if (open === 'search') mobileSearch.current?.focus();

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
    setOpen((current) => current === next ? null : next);
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
    navigate({ pathname: '/', search: catalogParams.toString(), hash: '#discover-concerts' });
  }

  return (
    <header className="public-header" ref={header}>
      <div className="public-topbar page-width">
        <Logo to={getRoleHome(user?.role)} label={getRoleHomeLabel(user?.role)} />
        <nav className="public-main-nav" aria-label={translate("shared:publicLayout_dieuHuongChinh")}>
          {canBrowseCatalogue ? <NavLink to="/" end>{translate("shared:publicLayout_khamPha")}</NavLink> : null}
          {isAudience ? (
            <>
              <NavLink to="/my-tickets">{translate("shared:publicLayout_veCuaToi")}</NavLink>
              <NavLink to="/notifications"><NotificationLabel count={unreadNotifications} /></NavLink>
            </>
          ) : null}
          <WorkspaceLink user={user} />
        </nav>
        <div className="public-header-actions">
          {canBrowseCatalogue ? (
            <>
              <div className="public-desktop-control">
                <HeaderSearch onSubmit={submitSearch} query={searchQuery} />
              </div>
              <button
                className="public-header-action public-mobile-control"
                type="button"
                aria-label={translate("shared:publicLayout_timSuKien")}
                aria-expanded={open === 'search'}
                aria-controls={open === 'search' ? 'public-mobile-search' : undefined}
                onClick={(event) => toggle('search', event.currentTarget)}
              >
                <Search size={20} aria-hidden="true" />
              </button>
            </>
          ) : null}
          {isAudience ? (
            <NavLink className="public-mobile-wallet public-mobile-control" to="/my-tickets" aria-label={translate("shared:publicLayout_veCuaToi")}>
              <Ticket size={21} aria-hidden="true" />
              <span aria-hidden="true">{translate("shared:publicLayout_veNgan")}</span>
            </NavLink>
          ) : null}
          <LanguageSelect compact />
          {user ? (
            <div className="public-account public-desktop-control">
              <button
                className="public-account-trigger"
                type="button"
                aria-label={translate("shared:publicLayout_moMenuTaiKhoan")}
                aria-expanded={open === 'account'}
                aria-controls={open === 'account' ? 'public-account-panel' : undefined}
                onClick={(event) => toggle('account', event.currentTarget)}
              >
                <span className="public-account-initials" aria-hidden="true">{initials(user.fullName)}</span>
                <span className="public-account-name">{user.fullName}</span>
                <ChevronDown size={16} aria-hidden="true" />
              </button>
              {open === 'account' ? (
                <div id="public-account-panel" className="public-account-panel public-menu-links">
                  <AccountMenuLinks user={user} close={close} onLogout={logout} />
                </div>
              ) : null}
            </div>
          ) : !loading ? (
            <div className="public-desktop-control">
              <Link className="button button-primary public-sign-in" to="/login">
                {translate("shared:publicLayout_dangNhap")}
              </Link>
            </div>
          ) : null}
          <button
            className="public-header-action public-mobile-control"
            type="button"
            aria-label={translate("shared:publicLayout_batTatDieuHuong")}
            aria-expanded={open === 'menu'}
            aria-controls={open === 'menu' ? 'public-mobile-menu' : undefined}
            aria-describedby={unreadNotifications > 0 ? 'public-mobile-unread' : undefined}
            onClick={(event) => toggle('menu', event.currentTarget)}
          >
            <Menu size={21} aria-hidden="true" />
            {unreadNotifications > 0 ? (
              <>
                <span className="public-menu-notification" aria-hidden="true" />
                <span className="sr-only" id="public-mobile-unread">
                  {translate("shared:publicLayout_thongBaoChuaDoc", { count: unreadNotifications })}
                </span>
              </>
            ) : null}
          </button>
        </div>
      </div>
      {open === 'search' && canBrowseCatalogue ? (
        <div id="public-mobile-search" className="public-mobile-panel">
          <div className="page-width"><HeaderSearch onSubmit={submitSearch} query={searchQuery} inputRef={mobileSearch} /></div>
        </div>
      ) : null}
      {open === 'menu' ? (
        <div id="public-mobile-menu" className="public-mobile-panel">
          <nav className="page-width public-menu-links" aria-label={translate("shared:publicLayout_dieuHuongDiDong")}>
            {canBrowseCatalogue ? <NavLink to="/" onClick={close} end>{translate("shared:publicLayout_khamPha")}</NavLink> : null}
            {user ? (
              <AccountMenuLinks user={user} close={close} onLogout={logout}>
                {isAudience ? <NavLink to="/notifications" onClick={close}><NotificationLabel count={unreadNotifications} /></NavLink> : null}
                <WorkspaceLink user={user} close={close} />
              </AccountMenuLinks>
            ) : !loading ? (
              <>
                <NavLink to="/login" onClick={close}>{translate("shared:publicLayout_dangNhap")}</NavLink>
                <NavLink to="/register" onClick={close}>{translate("shared:publicLayout_taoTaiKhoan")}</NavLink>
              </>
            ) : null}
          </nav>
        </div>
      ) : null}
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

  const isBookingFlow =
    /^\/concerts\/[^/]+\/(waiting-room|seats)$/.test(location.pathname) ||
    ['/checkout', '/booking-confirmation', '/payment/result'].includes(location.pathname);

  const audienceId = user?.role === 'AUDIENCE' && !loading ? user.id : null;
  const notificationSession = useMemo(
    () => audienceId && token ? { audienceId, token } : null,
    [audienceId, token],
  );
  const [unreadResult, setUnreadResult] = useState<{ session: typeof notificationSession; count: number }>();
  const unreadRequest = useRef<AbortController>();
  const unreadNotifications = unreadResult?.session === notificationSession ? unreadResult.count : 0;

  const refreshUnreadNotifications = useCallback(() => {
    if (!notificationSession) return;
    unreadRequest.current?.abort();
    const controller = new AbortController();
    unreadRequest.current = controller;

    void getUnreadNotificationCount(controller.signal).then(({ count }) => {
      if (!controller.signal.aborted) setUnreadResult({ session: notificationSession, count });
    }).catch((error) => {
      if (!controller.signal.aborted && isNotificationAccessDenied(error)) setUnreadResult(undefined);
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
        {translate("shared:publicLayout_boQuaDenNoiDung")}
      </a>
      {isBookingFlow ? <div className="page-width booking-language"><LanguageSelect /></div> : (
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
          <Outlet context={{ refreshUnreadNotifications, clearUnreadNotifications } satisfies PublicLayoutContext} />
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
          <nav aria-label={translate("shared:publicLayout_dieuHuongCuoiTrang")}>
            <ul className="footer-links">
              {canBrowse ? <li><Link to="/">{translate("shared:publicLayout_khamPhaSuKien")}</Link></li> : null}
              {user?.role === 'AUDIENCE' ? (
                <>
                  <li><Link to="/profile?tab=orders">{translate("shared:publicLayout_lichSuDonHang")}</Link></li>
                  <li><Link to="/my-tickets">{translate("shared:publicLayout_veCuaToi")}</Link></li>
                </>
              ) : null}
              {!user ? (
                <>
                  <li><Link to="/login">{translate("shared:publicLayout_dangNhap")}</Link></li>
                  <li><Link to="/register">{translate("shared:publicLayout_taoTaiKhoan")}</Link></li>
                </>
              ) : null}
              {buyerInformationLinks.map(({ label, url }) => (
                <li key={label}><a href={url} target="_blank" rel="noreferrer">{translate(label)}</a></li>
              ))}
            </ul>
          </nav>
        ) : null}
      </div>
    </footer>
  );
}
