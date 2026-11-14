import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
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
import { LanguageSelect } from '../LanguageSelect';

type NavigationItem = {
  to: string;
  label: string;
  icon: typeof BarChart3;
  end?: boolean;
  grant?: OrganizationGrant;
};

const adminNavigation: NavigationItem[] = [
  { to: '/admin', get label() { return translate("shared:operationsLayout_tongQuan"); }, icon: BarChart3, end: true },
  { to: '/admin/concerts', get label() { return translate("shared:operationsLayout_buoiDien"); }, icon: CalendarDays },
  { to: '/admin/ticket-types', get label() { return translate("shared:operationsLayout_hangVe"); }, icon: Ticket },
  { to: '/admin/reconciliation', get label() { return translate("shared:operationsLayout_doiSoat"); }, icon: CircleDollarSign },
  { to: '/admin/orders', get label() { return translate("shared:operationsLayout_donHangVe"); }, icon: Receipt },
  { to: '/admin/guests', get label() { return translate("shared:operationsLayout_khachMoi"); }, icon: Users },
  { to: '/admin/notifications', get label() { return translate("shared:operationsLayout_thongBao"); }, icon: Bell },
  { to: '/admin/organizations', get label() { return translate("shared:operationsLayout_toChuc"); }, icon: Users },
  { to: '/admin/users', get label() { return translate("shared:operationsLayout_nguoiDung"); }, icon: UserCog },
];

const staffNavigation: NavigationItem[] = [
  { to: '/staff', get label() { return translate("shared:operationsLayout_caLamViec"); }, icon: ClipboardCheck, end: true },
  { to: '/staff/check-in', get label() { return translate("shared:operationsLayout_quetQr"); }, icon: ScanLine },
  { to: '/staff/guests', get label() { return translate("shared:operationsLayout_traKhach"); }, icon: Users },
  { to: '/staff/history', get label() { return translate("shared:operationsLayout_lichSuVaoCong"); }, icon: FileClock },
];

const organizerNavigation: NavigationItem[] = [
  { to: '/organizer', get label() { return translate("shared:operationsLayout_tongQuan"); }, icon: BarChart3, end: true },
  { to: '/organizer/concerts', grant: 'EVENTS', get label() { return translate("shared:operationsLayout_buoiDien"); }, icon: CalendarDays },
  { to: '/organizer/ticket-types', grant: 'EVENTS', get label() { return translate("shared:operationsLayout_hangVe"); }, icon: Ticket },
  { to: '/organizer/reconciliation', grant: 'FINANCE', get label() { return translate("shared:operationsLayout_doiSoat"); }, icon: CircleDollarSign },
  { to: '/organizer/orders', grant: 'FINANCE', get label() { return translate("shared:operationsLayout_donHangVe"); }, icon: Receipt },
  { to: '/organizer/guests', grant: 'EVENTS', get label() { return translate("shared:operationsLayout_khachMoi"); }, icon: Users },
  { to: '/organizer/revenue', grant: 'FINANCE', get label() { return translate('shared:operationsLayout_revenue'); }, icon: CircleDollarSign },
  { to: '/organizer/members', grant: 'MEMBERS', get label() { return translate("shared:operationsLayout_thanhVien"); }, icon: UserCog },
];

function roleLabel(role: UserSummary['role']) {
  if (role === 'ADMIN') return translate("shared:operationsLayout_quanTriVien");
  if (role === 'ORGANIZER') return translate("shared:operationsLayout_nhaToChuc");
  return translate("shared:operationsLayout_nhanVienCong");
}

export function OperationsLayout({ mode }: { mode: 'admin' | 'organizer' | 'staff' }) {
  useTranslation();
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
      ? translate("shared:operationsLayout_phongDieuHanh")
      : mode === 'organizer'
        ? translate("shared:operationsLayout_khongGianNhaToChuc")
        : translate("shared:operationsLayout_banSoatVe");

  function logOut() {
    logout();
    navigate('/');
  }

  return (
    <div className="operations-shell">
      <aside
        className={`operations-sidebar ${mobileOpen ? 'is-open' : ''}`}
        aria-label={mode === 'staff' ? translate("shared:operationsLayout_dieuHuongNhanVien") : translate("shared:operationsLayout_dieuHuongQuanLy")}
      >
        <div className="operations-brand">
          <Logo to={workspaceHome} label={workspaceLabel} />
          <span>{workspaceLabel}</span>
        </div>

        <nav className="operations-nav">
          <p>{translate("shared:operationsLayout_khongGianLamViec")}</p>
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
            {translate("shared:operationsLayout_dangXuat")}
          </button>
        </div>
      </aside>

      {mobileOpen ? (
        <button
          className="operations-scrim"
          type="button"
          aria-label={translate("shared:operationsLayout_dongDieuHuong")}
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <div className="operations-main">
        <header className="operations-topbar">
          <button
            className="operations-menu-button"
            type="button"
            aria-label={mobileOpen ? translate("shared:operationsLayout_dongDieuHuong") : translate("shared:operationsLayout_moDieuHuong")}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((value) => !value)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className={mode === 'organizer' ? 'operations-context organization-context' : 'operations-context'}>
            <span>
              {mode === 'admin'
                ? translate("shared:operationsLayout_quanLyVanHanh")
                : mode === 'organizer'
                  ? translate("shared:operationsLayout_khongGianNhaToChuc")
                  : translate("shared:operationsLayout_vanHanhTaiCong")}
            </span>
            {mode === 'organizer' && organization?.memberships.length ? (
              <select
                aria-label={translate("shared:operationsLayout_toChucDangLamViec")}
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
            <LanguageSelect />
            <button
              type="button"
              aria-expanded={accountOpen}
              onClick={() => setAccountOpen((value) => !value)}
            >
              <span className="operations-avatar">{user?.fullName.slice(0, 2).toUpperCase()}</span>
              <span>
                <strong>{user?.fullName}</strong>
                <small>{mode === 'organizer' ? translate("shared:operationsLayout_nhaToChuc") : user ? roleLabel(user.role) : ''}</small>
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
                  {translate("shared:operationsLayout_veTongQuan")}
                </Link>
                <button type="button" className="operations-danger-menu-item" onClick={logOut}>
                  <LogOut aria-hidden="true" size={16} />
                  {translate("shared:operationsLayout_dangXuat")}
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
