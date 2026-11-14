import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { type FormEvent, useEffect, useState } from 'react';
import { ChevronDown, LogOut, Search } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { getUnreadNotificationCount } from '../../api/notifications';
import { useAuth } from '../../features/auth/AuthContext';
import { getRoleHome, getRoleHomeLabel } from '../../features/auth/roleRoutes';
import { buyerInformationLinks } from '../../features/ticket/buyerInformation';
import { LanguageSelect } from '../LanguageSelect';

export function Logo({ to = '/', label = translate("shared:publicLayout_trangChuTicketbox") }: { to?: string; label?: string }) {
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
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function NotificationLabel({ count }: { count: number }) {
  useTranslation();
  return (
    <span className="notification-link-label">
      {translate("shared:publicLayout_thongBao")}
      {count > 0 ? (
        <span className="notification-badge" aria-label={translate("shared:publicLayout_thongBaoChuaDoc", { count })}>
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </span>
  );
}

export function PublicLayout() {
  useTranslation();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [headerSearch, setHeaderSearch] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  const isBookingFlow =
    /^\/concerts\/[^/]+\/(waiting-room|seats)$/.test(location.pathname) ||
    ['/checkout', '/booking-confirmation', '/payment/result'].includes(location.pathname);

  const homePath = getRoleHome(user?.role);
  const homeLabel = getRoleHomeLabel(user?.role);
  const canBrowseCatalogue = !user || user.role === 'AUDIENCE' || user.role === 'ORGANIZER';
  const isAudience = user?.role === 'AUDIENCE';

  function logOut() {
    setMenuOpen(false);
    setMobileOpen(false);
    setUnreadNotifications(0);
    logout();
    navigate('/');
  }

  function submitHeaderSearch(event: FormEvent) {
    event.preventDefault();
    const query = headerSearch.trim();
    navigate(query ? `/?q=${encodeURIComponent(query)}` : '/');
    setHeaderSearch('');
  }

  useEffect(() => {
    if (!user) {
      setUnreadNotifications(0);
      return;
    }

    const controller = new AbortController();
    getUnreadNotificationCount(controller.signal)
      .then((result) => setUnreadNotifications(result.count))
      .catch(() => setUnreadNotifications(0));

    return () => controller.abort();
  }, [user?.id]);

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        {translate("shared:publicLayout_boQuaDenNoiDung")}
      </a>
      {!isBookingFlow ? (
        <header className="site-header">
          <div className="header-inner">
            <Logo to={homePath} label={homeLabel} />
            <nav className="desktop-nav" aria-label={translate("shared:publicLayout_dieuHuongChinh")}>
              {canBrowseCatalogue ? <NavLink to="/">{translate("shared:publicLayout_khamPha")}</NavLink> : null}
              {isAudience ? <NavLink to="/my-tickets">{translate("shared:publicLayout_veCuaToi")}</NavLink> : null}
              {isAudience ? (
                <NavLink to="/notifications">
                  <NotificationLabel count={unreadNotifications} />
                </NavLink>
              ) : null}
              {user?.role === 'ADMIN' ? <NavLink to="/admin">{translate("shared:publicLayout_quanTri")}</NavLink> : null}
              {user ? (
                <NavLink to="/organizer">{translate("shared:publicLayout_khongGianNhaToChuc")}</NavLink>
              ) : null}
              {user?.role === 'STAFF' ? <NavLink to="/staff">{translate("shared:publicLayout_vanHanhCong")}</NavLink> : null}
            </nav>
            <div className="header-actions">
              <LanguageSelect />
              <form className="header-search" onSubmit={submitHeaderSearch}>
                <span className="sr-only">{translate("shared:publicLayout_timSuKien")}</span>
                <Search aria-hidden="true" size={16} />
                <input
                  value={headerSearch}
                  onChange={(event) => setHeaderSearch(event.target.value)}
                  type="search"
                  name="event-search"
                  autoComplete="off"
                  placeholder={translate("shared:publicLayout_timNgheSiSuKien")}
                />
              </form>
              {user ? (
                <div className="account-wrap">
                  <button
                    className="avatar-button"
                    type="button"
                    aria-label={translate("shared:publicLayout_moMenuTaiKhoan")}
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((value) => !value)}
                  >
                    <span>{initials(user.fullName)}</span>
                    <span className="account-name">{user.fullName}</span>
                    <ChevronDown aria-hidden="true" size={15} />
                  </button>
                  {menuOpen ? (
                    <div className="account-menu">
                      <div>
                        <strong>{user.fullName}</strong>
                        <span>{user.email}</span>
                        <span>{user.role}</span>
                      </div>
                      {isAudience ? (
                        <Link to="/profile" onClick={() => setMenuOpen(false)}>
                          {translate("shared:publicLayout_hoSoLichSu")}
                        </Link>
                      ) : null}
                      {isAudience ? (
                        <Link to="/notifications" onClick={() => setMenuOpen(false)}>
                          <NotificationLabel count={unreadNotifications} />
                        </Link>
                      ) : null}
                      {isAudience ? (
                        <Link to="/my-tickets" onClick={() => setMenuOpen(false)}>
                          {translate("shared:publicLayout_veCuaToi")}
                        </Link>
                      ) : null}
                      {user.role === 'ADMIN' ? (
                        <Link to="/admin" onClick={() => setMenuOpen(false)}>
                          {translate("shared:publicLayout_quanTri")}
                        </Link>
                      ) : null}
                      {user ? (
                        <Link to="/organizer" onClick={() => setMenuOpen(false)}>
                          {translate("shared:publicLayout_khongGianNhaToChuc")}
                        </Link>
                      ) : null}
                      {user.role === 'STAFF' ? (
                        <Link to="/staff" onClick={() => setMenuOpen(false)}>
                          {translate("shared:publicLayout_vanHanhCong")}
                        </Link>
                      ) : null}
                      <button type="button" className="account-menu-danger" onClick={logOut}>
                        <LogOut size={15} aria-hidden="true" /> {translate("shared:publicLayout_dangXuat")}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="auth-cta-group">
                  <Link className="button button-primary" to="/login">
                    {translate("shared:publicLayout_dangNhap")}
                  </Link>
                  <Link className="button button-secondary" to="/register">
                    {translate("shared:publicLayout_taoTaiKhoan")}
                  </Link>
                </div>
              )}
              <button
                className="mobile-menu-button"
                type="button"
                aria-label={translate("shared:publicLayout_batTatDieuHuong")}
                aria-expanded={mobileOpen}
                onClick={() => setMobileOpen((value) => !value)}
              >
                <span />
                <span />
              </button>
            </div>
          </div>
          {mobileOpen ? (
            <nav className="mobile-nav" aria-label={translate("shared:publicLayout_dieuHuongDiDong")}>
              {canBrowseCatalogue ? (
                <NavLink to="/" onClick={() => setMobileOpen(false)}>
                  {translate("shared:publicLayout_khamPha")}
                </NavLink>
              ) : null}
              {isAudience ? (
                <NavLink to="/profile" onClick={() => setMobileOpen(false)}>
                  {translate("shared:publicLayout_hoSo")}
                </NavLink>
              ) : null}
              {isAudience ? (
                <NavLink to="/notifications" onClick={() => setMobileOpen(false)}>
                  <NotificationLabel count={unreadNotifications} />
                </NavLink>
              ) : null}
              {isAudience ? (
                <NavLink to="/my-tickets" onClick={() => setMobileOpen(false)}>
                  {translate("shared:publicLayout_veCuaToi")}
                </NavLink>
              ) : null}
              {user?.role === 'ADMIN' ? (
                <NavLink to="/admin" onClick={() => setMobileOpen(false)}>
                  {translate("shared:publicLayout_quanTri")}
                </NavLink>
              ) : null}
              {user ? (
                <NavLink to="/organizer" onClick={() => setMobileOpen(false)}>
                  {translate("shared:publicLayout_khongGianNhaToChuc")}
                </NavLink>
              ) : null}
              {user?.role === 'STAFF' ? (
                <NavLink to="/staff" onClick={() => setMobileOpen(false)}>
                  {translate("shared:publicLayout_vanHanhCong")}
                </NavLink>
              ) : null}
              {user ? (
                <button type="button" onClick={logOut}>
                  {translate("shared:publicLayout_dangXuat")}
                </button>
              ) : (
                <>
                  <NavLink to="/login" onClick={() => setMobileOpen(false)}>
                    {translate("shared:publicLayout_dangNhap")}
                  </NavLink>
                  <NavLink to="/register" onClick={() => setMobileOpen(false)}>
                    {translate("shared:publicLayout_taoTaiKhoan")}
                  </NavLink>
                </>
              )}
            </nav>
          ) : null}
        </header>
      ) : <div className="page-width booking-language"><LanguageSelect /></div>}
      <main id="main-content">
        <div key={location.pathname} className="route-transition">
          <Outlet />
        </div>
      </main>
      {!isBookingFlow ? <Footer homePath={homePath} homeLabel={homeLabel} /> : null}
    </div>
  );
}

function Footer({ homePath, homeLabel }: { homePath: string; homeLabel: string }) {
  useTranslation();
  const { user } = useAuth();
  const canBrowse = !user || user.role === 'AUDIENCE' || user.role === 'ORGANIZER';

  return (
    <footer className="site-footer">
      <div className="footer-grid page-width">
        <div className="footer-brand">
          <Logo to={homePath} label={homeLabel} />
          <p>{translate("shared:publicLayout_nhungDemDienKhoQuenChiCach")}</p>
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
              {!user ? <li><Link to="/login">{translate("shared:publicLayout_dangNhap")}</Link></li> : null}
              {buyerInformationLinks.map(({ label, url }) => (
                <li key={label}><a href={url} target="_blank" rel="noreferrer">{translate(label)}</a></li>
              ))}
            </ul>
          </nav>
        ) : null}
      </div>
      <div className="footer-bottom page-width">
        © 2026 TicketBox Vietnam
      </div>
    </footer>
  );
}
