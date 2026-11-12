import { type FormEvent, useEffect, useState } from 'react';
import { ChevronDown, LogOut, Search } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { getUnreadNotificationCount } from '../../api/notifications';
import { useAuth } from '../../features/auth/AuthContext';
import { getRoleHome, getRoleHomeLabel } from '../../features/auth/roleRoutes';

export function Logo({ to = '/', label = 'Trang chủ TicketBox' }: { to?: string; label?: string }) {
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
  return (
    <span className="notification-link-label">
      Thông báo
      {count > 0 ? (
        <span className="notification-badge" aria-label={`${count} thông báo chưa đọc`}>
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </span>
  );
}

export function PublicLayout() {
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
        Bỏ qua đến nội dung
      </a>
      {!isBookingFlow ? (
        <header className="site-header">
          <div className="header-inner">
            <Logo to={homePath} label={homeLabel} />
            <nav className="desktop-nav" aria-label="Điều hướng chính">
              {canBrowseCatalogue ? <NavLink to="/">Khám phá</NavLink> : null}
              {isAudience ? <NavLink to="/my-tickets">Vé của tôi</NavLink> : null}
              {isAudience ? (
                <NavLink to="/notifications">
                  <NotificationLabel count={unreadNotifications} />
                </NavLink>
              ) : null}
              {user?.role === 'ADMIN' ? <NavLink to="/admin">Quản trị</NavLink> : null}
              {user ? (
                <NavLink to="/organizer">Không gian nhà tổ chức</NavLink>
              ) : null}
              {user?.role === 'STAFF' ? <NavLink to="/staff">Vận hành cổng</NavLink> : null}
            </nav>
            <div className="header-actions">
              <form className="header-search" onSubmit={submitHeaderSearch}>
                <span className="sr-only">Tìm sự kiện</span>
                <Search aria-hidden="true" size={16} />
                <input
                  value={headerSearch}
                  onChange={(event) => setHeaderSearch(event.target.value)}
                  type="search"
                  name="event-search"
                  autoComplete="off"
                  placeholder="Tìm nghệ sĩ, sự kiện..."
                />
              </form>
              {user ? (
                <div className="account-wrap">
                  <button
                    className="avatar-button"
                    type="button"
                    aria-label="Mở menu tài khoản"
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
                          Hồ sơ & lịch sử
                        </Link>
                      ) : null}
                      {isAudience ? (
                        <Link to="/notifications" onClick={() => setMenuOpen(false)}>
                          <NotificationLabel count={unreadNotifications} />
                        </Link>
                      ) : null}
                      {isAudience ? (
                        <Link to="/my-tickets" onClick={() => setMenuOpen(false)}>
                          Vé của tôi
                        </Link>
                      ) : null}
                      {user.role === 'ADMIN' ? (
                        <Link to="/admin" onClick={() => setMenuOpen(false)}>
                          Quản trị
                        </Link>
                      ) : null}
                      {user ? (
                        <Link to="/organizer" onClick={() => setMenuOpen(false)}>
                          Không gian nhà tổ chức
                        </Link>
                      ) : null}
                      {user.role === 'STAFF' ? (
                        <Link to="/staff" onClick={() => setMenuOpen(false)}>
                          Vận hành cổng
                        </Link>
                      ) : null}
                      <button type="button" className="account-menu-danger" onClick={logOut}>
                        <LogOut size={15} aria-hidden="true" /> Đăng xuất
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="auth-cta-group">
                  <Link className="button button-primary" to="/login">
                    Đăng nhập
                  </Link>
                  <Link className="button button-secondary" to="/register">
                    Tạo tài khoản
                  </Link>
                </div>
              )}
              <button
                className="mobile-menu-button"
                type="button"
                aria-label="Bật/tắt điều hướng"
                aria-expanded={mobileOpen}
                onClick={() => setMobileOpen((value) => !value)}
              >
                <span />
                <span />
              </button>
            </div>
          </div>
          {mobileOpen ? (
            <nav className="mobile-nav" aria-label="Điều hướng di động">
              {canBrowseCatalogue ? (
                <NavLink to="/" onClick={() => setMobileOpen(false)}>
                  Khám phá
                </NavLink>
              ) : null}
              {isAudience ? (
                <NavLink to="/profile" onClick={() => setMobileOpen(false)}>
                  Hồ sơ
                </NavLink>
              ) : null}
              {isAudience ? (
                <NavLink to="/notifications" onClick={() => setMobileOpen(false)}>
                  <NotificationLabel count={unreadNotifications} />
                </NavLink>
              ) : null}
              {isAudience ? (
                <NavLink to="/my-tickets" onClick={() => setMobileOpen(false)}>
                  Vé của tôi
                </NavLink>
              ) : null}
              {user?.role === 'ADMIN' ? (
                <NavLink to="/admin" onClick={() => setMobileOpen(false)}>
                  Quản trị
                </NavLink>
              ) : null}
              {user ? (
                <NavLink to="/organizer" onClick={() => setMobileOpen(false)}>
                  Không gian nhà tổ chức
                </NavLink>
              ) : null}
              {user?.role === 'STAFF' ? (
                <NavLink to="/staff" onClick={() => setMobileOpen(false)}>
                  Vận hành cổng
                </NavLink>
              ) : null}
              {user ? (
                <button type="button" onClick={logOut}>
                  Đăng xuất
                </button>
              ) : (
                <>
                  <NavLink to="/login" onClick={() => setMobileOpen(false)}>
                    Đăng nhập
                  </NavLink>
                  <NavLink to="/register" onClick={() => setMobileOpen(false)}>
                    Tạo tài khoản
                  </NavLink>
                </>
              )}
            </nav>
          ) : null}
        </header>
      ) : null}
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
  const { user } = useAuth();

  return (
    <footer className="site-footer">
      <div className="footer-grid page-width">
        <div className="footer-brand">
          <Logo to={homePath} label={homeLabel} />
          <p>Những đêm diễn khó quên, chỉ cách bạn một tấm vé.</p>
        </div>
        {!user || user.role === 'AUDIENCE' || user.role === 'ORGANIZER' ? (
          <nav aria-label="Điều hướng cuối trang">
            <ul className="footer-links">
              <li><Link to="/">Khám phá sự kiện</Link></li>
              {user?.role === 'AUDIENCE' ? (
                <>
                  <li><Link to="/profile?tab=orders">Lịch sử đơn hàng</Link></li>
                  <li><Link to="/my-tickets">Vé của tôi</Link></li>
                </>
              ) : null}
              {!user ? <li><Link to="/login">Đăng nhập</Link></li> : null}
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
