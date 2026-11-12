import type { OrganizationGrant } from '../../api/organizations';
import { useOrganization } from '../../features/organizations/OrganizationProvider';
import { useState } from 'react';
import {
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  FileClock,
  LogOut,
  Menu,
  Receipt,
  ScanLine,
  Settings,
  Ticket,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, type UserSummary } from '../../features/auth/AuthContext';
import { Logo } from './PublicLayout';

type NavigationItem = {
  to: string;
  label: string;
  icon: typeof BarChart3;
  end?: boolean;
  grant?: OrganizationGrant;
};

const adminNavigation: NavigationItem[] = [
  { to: '/admin', label: 'Tổng quan', icon: BarChart3, end: true },
  { to: '/admin/concerts', label: 'Buổi diễn', icon: CalendarDays },
  { to: '/admin/ticket-types', label: 'Hạng vé', icon: Ticket },
  { to: '/admin/reconciliation', label: 'Đối soát', icon: CircleDollarSign },
  { to: '/admin/orders', label: 'Đơn hàng & vé', icon: Receipt },
  { to: '/admin/guests', label: 'Khách mời', icon: Users },
  { to: '/admin/notifications', label: 'Thông báo', icon: Bell },
  { to: '/admin/organizations', label: 'Tổ chức', icon: Users },
  { to: '/admin/users', label: 'Người dùng', icon: UserCog },
];

const staffNavigation: NavigationItem[] = [
  { to: '/staff', label: 'Ca làm việc', icon: ClipboardCheck, end: true },
  { to: '/staff/check-in', label: 'Quét QR', icon: ScanLine },
  { to: '/staff/guests', label: 'Tra khách', icon: Users },
  { to: '/staff/history', label: 'Lịch sử vào cổng', icon: FileClock },
];

const organizerNavigation: NavigationItem[] = [
  { to: '/organizer', label: 'Tổng quan', icon: BarChart3, end: true },
  { to: '/organizer/concerts', grant: 'EVENTS', label: 'Buổi diễn', icon: CalendarDays },
  { to: '/organizer/ticket-types', grant: 'EVENTS', label: 'Hạng vé', icon: Ticket },
  { to: '/organizer/reconciliation', grant: 'FINANCE', label: 'Đối soát', icon: CircleDollarSign },
  { to: '/organizer/orders', grant: 'FINANCE', label: 'Đơn hàng & vé', icon: Receipt },
  { to: '/organizer/guests', grant: 'EVENTS', label: 'Khách mời', icon: Users },
  { to: '/organizer/revenue', grant: 'FINANCE', label: 'Doanh thu', icon: CircleDollarSign },
  { to: '/organizer/members', grant: 'MEMBERS', label: 'Thành viên', icon: UserCog },
];

function roleLabel(role: UserSummary['role']) {
  if (role === 'ADMIN') return 'Quản trị viên';
  if (role === 'ORGANIZER') return 'Nhà tổ chức';
  return 'Nhân viên cổng';
}

export function OperationsLayout({ mode }: { mode: 'admin' | 'organizer' | 'staff' }) {
  const { user, logout } = useAuth();
  const organization = useOrganization();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const navigation =
    mode === 'admin'
      ? adminNavigation
      : mode === 'organizer'
        ? organizerNavigation.filter((item) => !item.grant || organization?.selected?.grants.includes(item.grant))
        : staffNavigation;
  const workspaceHome =
    mode === 'admin' ? '/admin' : mode === 'organizer' ? '/organizer' : '/staff';
  const workspaceLabel =
    mode === 'admin'
      ? 'Phòng điều hành'
      : mode === 'organizer'
        ? 'Không gian nhà tổ chức'
        : 'Bàn soát vé';

  function logOut() {
    logout();
    navigate('/');
  }

  return (
    <div className="operations-shell">
      <aside
        className={`operations-sidebar ${mobileOpen ? 'is-open' : ''}`}
        aria-label={mode === 'staff' ? 'Điều hướng nhân viên' : 'Điều hướng quản lý'}
      >
        <div className="operations-brand">
          <Logo to={workspaceHome} label={workspaceLabel} />
          <span>{workspaceLabel}</span>
        </div>

        <nav className="operations-nav">
          <p>Không gian làm việc</p>
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileOpen(false)}
              >
                <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="operations-sidebar-footer">
          <button type="button" onClick={logOut}>
            <LogOut aria-hidden="true" size={17} />
            Đăng xuất
          </button>
        </div>
      </aside>

      {mobileOpen ? (
        <button
          className="operations-scrim"
          type="button"
          aria-label="Đóng điều hướng"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <div className="operations-main">
        <header className="operations-topbar">
          <button
            className="operations-menu-button"
            type="button"
            aria-label={mobileOpen ? 'Đóng điều hướng' : 'Mở điều hướng'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((value) => !value)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className={mode === 'organizer' ? 'operations-context organization-context' : 'operations-context'}>
            <span>
              {mode === 'admin'
                ? 'Quản lý vận hành'
                : mode === 'organizer'
                  ? 'Không gian nhà tổ chức'
                  : 'Vận hành tại cổng'}
            </span>
            {mode === 'organizer' && organization?.memberships.length ? (
              <select
                aria-label="Tổ chức đang làm việc"
                value={organization.selected?.id ?? ''}
                onChange={(event) => {
                  organization.choose(event.target.value);
                  navigate('/organizer');
                }}
                disabled={organization.loading}
              >
                {organization.memberships.map((membership) => (
                  <option key={membership.id} value={membership.id}>{membership.name}</option>
                ))}
              </select>
            ) : <strong>TicketBox Vietnam</strong>}
          </div>
          <div className="operations-account">
            <button
              type="button"
              aria-expanded={accountOpen}
              onClick={() => setAccountOpen((value) => !value)}
            >
              <span className="operations-avatar">{user?.fullName.slice(0, 2).toUpperCase()}</span>
              <span>
                <strong>{user?.fullName}</strong>
                <small>{mode === 'organizer' ? 'Nhà tổ chức' : user ? roleLabel(user.role) : ''}</small>
              </span>
              <ChevronDown aria-hidden="true" size={16} />
            </button>
            {accountOpen ? (
              <div className="operations-account-menu">
                <Link
                  className="internal-profile-link"
                  to={workspaceHome}
                  onClick={() => setAccountOpen(false)}
                >
                  <Settings aria-hidden="true" size={16} />
                  Về tổng quan
                </Link>
                <button type="button" className="operations-danger-menu-item" onClick={logOut}>
                  <LogOut aria-hidden="true" size={16} />
                  Đăng xuất
                </button>
              </div>
            ) : null}
          </div>
        </header>
        <main className="operations-content">
          <div key={`${location.pathname}:${organization?.selected?.id ?? ''}`} className="route-transition">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
