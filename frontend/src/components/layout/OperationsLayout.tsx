import { currentLanguage, languages, selectLanguage, translate, type Language } from '../../i18n';
import { useTranslation } from 'react-i18next';
import type { OrganizationGrant } from '../../api/organizations';
import { useOrganization } from '../../features/organizations/OrganizationProvider';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
} from 'react';
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileClock,
  Gauge,
  LayoutDashboard,
  ListMusic,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  ScanLine,
  Settings,
  Sun,
  Ticket,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, type UserSummary } from '../../features/auth/AuthContext';
import { Logo } from './PublicLayout';
import { WorkspaceSelect } from '../WorkspaceSelect';
import { WorkspaceRouteBoundary } from './WorkspaceRouteBoundary';
import { useThemePreference } from '../../hooks/useThemePreference';
import type { OperationsConcertContext } from './operationsConcertNavigation';

type WorkspaceMode = 'admin' | 'organizer' | 'staff';
type Sidebar = 'primary' | 'concert';
function sidebarPreferenceKey(mode: WorkspaceMode, sidebar: Sidebar) {
  return `ticketbox.workspace.${mode}.${sidebar}.collapsed`;
}

function initialCollapsed(mode: WorkspaceMode, sidebar: Sidebar) {
  try {
    return window.localStorage.getItem(sidebarPreferenceKey(mode, sidebar)) === 'true';
  } catch {
    return false;
  }
}

function railLabel(label: string, collapsed: boolean) {
  return collapsed ? { 'aria-label': label, title: label } : undefined;
}

function SidebarToggle({
  sidebar,
  collapsed,
  controls,
  onClick,
}: {
  sidebar: Sidebar;
  collapsed: boolean;
  controls: string;
  onClick: () => void;
}) {
  const label =
    sidebar === 'primary'
      ? translate(
          collapsed ? 'shared:operationsExpandMainSidebar' : 'shared:operationsCollapseMainSidebar',
        )
      : translate(
          collapsed
            ? 'shared:operationsExpandConcertSidebar'
            : 'shared:operationsCollapseConcertSidebar',
        );
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <button
      type="button"
      className="operations-sidebar-toggle"
      aria-label={label}
      title={label}
      aria-expanded={!collapsed}
      aria-controls={controls}
      onClick={onClick}
    >
      <Icon size={18} aria-hidden />
    </button>
  );
}

type NavigationItem = {
  to: string;
  label: string;
  icon: typeof BarChart3;
  end?: boolean;
  grant?: OrganizationGrant;
};

const drawerQuery = '(max-width: 1150px)';

function subscribeToDrawerWidth(onChange: () => void) {
  const query = window.matchMedia(drawerQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function usesDrawer() {
  return window.matchMedia(drawerQuery).matches;
}

const adminNavigation: NavigationItem[] = [
  {
    to: '/admin',
    get label() {
      return translate('shared:operationsLayout_tongQuan');
    },
    icon: LayoutDashboard,
    end: true,
  },
  {
    to: '/admin/orders',
    get label() {
      return translate('shared:operationsOrdersSupport');
    },
    icon: Receipt,
  },
  {
    to: '/admin/reports',
    get label() {
      return translate('shared:operationsReports');
    },
    icon: BarChart3,
  },
  {
    to: '/admin/organizations',
    get label() {
      return translate('shared:operationsLayout_toChuc');
    },
    icon: Users,
  },
  {
    to: '/admin/settings',
    get label() {
      return translate('shared:operationsSettings');
    },
    icon: Settings,
  },
];

const staffNavigation: NavigationItem[] = [
  {
    to: '/staff',
    get label() {
      return translate('shared:operationsLayout_caLamViec');
    },
    icon: ClipboardCheck,
    end: true,
  },
  {
    to: '/staff/check-in',
    get label() {
      return translate('shared:operationsLayout_quetQr');
    },
    icon: ScanLine,
  },
  {
    to: '/staff/guests',
    get label() {
      return translate('shared:operationsLayout_traKhach');
    },
    icon: Users,
  },
  {
    to: '/staff/history',
    get label() {
      return translate('shared:operationsLayout_lichSuVaoCong');
    },
    icon: FileClock,
  },
];

const organizerNavigation: NavigationItem[] = [
  {
    to: '/organizer',
    get label() {
      return translate('shared:operationsLayout_tongQuan');
    },
    icon: LayoutDashboard,
    end: true,
  },
  {
    to: '/organizer/reports',
    get label() {
      return translate('shared:operationsReports');
    },
    icon: BarChart3,
  },
  {
    to: '/organizer/members',
    grant: 'MEMBERS',
    get label() {
      return translate('shared:operationsLayout_thanhVien');
    },
    icon: UserCog,
  },
];

const concertRoutes = new Set([
  'events',
  'concerts',
  'event-review',
  'performance-operations',
  'ticket-types',
  'guests',
  'batch-logs',
  'artist-bio',
]);

function isPlainLinkClick(event: MouseEvent<HTMLAnchorElement>) {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.shiftKey
  );
}

function roleLabel(role: UserSummary['role']) {
  if (role === 'ADMIN') return translate('shared:operationsLayout_quanTriVien');
  if (role === 'ORGANIZER') return translate('shared:operationsLayout_nhaToChuc');
  return translate('shared:operationsLayout_nhanVienCong');
}

export function OperationsLayout({ mode }: { mode: WorkspaceMode }) {
  useTranslation();
  const { user, logout } = useAuth();
  const organization = useOrganization();
  const navigate = useNavigate();
  const location = useLocation();
  const narrow = useSyncExternalStore(subscribeToDrawerWidth, usesDrawer);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerConcert, setDrawerConcert] = useState(false);
  const [primaryCollapsed, setPrimaryCollapsed] = useState(() => initialCollapsed(mode, 'primary'));
  const [concertCollapsed, setConcertCollapsed] = useState(() => initialCollapsed(mode, 'concert'));
  const [disclosure, setDisclosure] = useState<{ locationKey: string; expanded: boolean }>();
  const [concert, setConcert] = useState<OperationsConcertContext | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const { theme, dark, toggleTheme: switchTheme } = useThemePreference();
  const drawer = useRef<HTMLDialogElement>(null);
  const drawerTrigger = useRef<HTMLButtonElement>(null);
  const concertTrigger = useRef<HTMLButtonElement>(null);
  const drawerBack = useRef<HTMLButtonElement>(null);
  const canCollapse = !narrow && mode !== 'staff';
  const primaryRail = canCollapse && primaryCollapsed;
  const concertRail = canCollapse && concertCollapsed;
  const themeAction = translate(
    dark ? 'shared:workspaceSwitchToLight' : 'shared:workspaceSwitchToDark',
  );
  const [home, ...navigation] =
    mode === 'admin'
      ? adminNavigation
      : mode === 'organizer'
        ? organizerNavigation.filter((item) =>
            item.to === '/organizer/reports'
              ? organization?.selected?.grants.some(
                  (grant) => grant === 'EVENTS' || grant === 'FINANCE',
                )
              : !item.grant || organization?.selected?.grants.includes(item.grant),
          )
        : staffNavigation;
  const workspaceHome =
    mode === 'admin' ? '/admin' : mode === 'organizer' ? '/organizer' : '/staff';
  const workspaceLabel =
    mode === 'admin'
      ? translate('shared:operationsLayout_phongDieuHanh')
      : mode === 'organizer'
        ? translate('shared:operationsLayout_khongGianNhaToChuc')
        : translate('shared:operationsLayout_banSoatVe');
  const navigationLabel =
    mode === 'staff'
      ? translate('shared:operationsLayout_dieuHuongNhanVien')
      : translate('shared:operationsLayout_dieuHuongQuanLy');
  const canOpenConcert =
    mode === 'admin' ||
    (mode === 'organizer' && !!organization?.selected?.grants.includes('EVENTS'));
  const pathname = location.pathname.replace(/\/$/, '');
  const inConcert = canOpenConcert && concertRoutes.has(pathname.split('/')[2]);
  const concertOpen =
    canOpenConcert && (disclosure?.locationKey === location.key ? disclosure.expanded : inConcert);
  const activeConcert =
    inConcert &&
    concert?.pathname === location.pathname &&
    concert.organizationId === organization?.selected?.id
      ? concert
      : null;
  const organizerId = organization?.selected?.id;
  const concertLabel = translate('shared:operationsConcert');
  const logoutLabel = translate('shared:operationsLayout_dangXuat');

  useEffect(() => {
    setDisclosure(undefined);
    drawer.current?.close();
  }, [location.key, organizerId]);

  useLayoutEffect(() => {
    if (!narrow) setDrawerOpen(false);
    else if (drawerOpen) (drawerConcert ? drawerBack : concertTrigger).current?.focus();
  }, [narrow, drawerOpen, drawerConcert]);

  function closeDrawer() {
    drawer.current?.close();
  }

  function openDrawer() {
    setDrawerConcert(inConcert);
    drawer.current?.showModal();
    setDrawerOpen(true);
  }

  function backToMainNavigation() {
    setDrawerConcert(false);
  }

  function toggleSidebar(sidebar: Sidebar) {
    const next = !(sidebar === 'primary' ? primaryCollapsed : concertCollapsed);
    if (sidebar === 'primary') setPrimaryCollapsed(next);
    else setConcertCollapsed(next);
    try {
      window.localStorage.setItem(sidebarPreferenceKey(mode, sidebar), String(next));
    } catch {
      // The current layout remains available in this session.
    }
  }

  function logOut() {
    logout();
    navigate('/');
  }

  function closeDrawerOnNavigation(event: MouseEvent<HTMLAnchorElement>) {
    if (isPlainLinkClick(event)) closeDrawer();
  }

  function navigationLink(item: NavigationItem, collapsed: boolean) {
    const Icon = item.icon;
    const label = item.label;
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        onClick={closeDrawerOnNavigation}
        {...railLabel(label, collapsed)}
      >
        <Icon aria-hidden size={18} strokeWidth={1.8} />
        <span className="operations-sidebar-label">{label}</span>
      </NavLink>
    );
  }

  const primarySidebar = (
    <aside
      id="operations-primary-navigation"
      className="operations-sidebar"
      data-collapsed={primaryRail || undefined}
      hidden={narrow && drawerConcert}
    >
      <div className="operations-brand">
        <div className="operations-brand-copy" title={primaryRail ? workspaceLabel : undefined}>
          <Logo to={workspaceHome} label={workspaceLabel} />
          <span className="operations-sidebar-label">{workspaceLabel}</span>
        </div>
        {canCollapse && (
          <SidebarToggle
            sidebar="primary"
            collapsed={primaryRail}
            controls="operations-primary-navigation"
            onClick={() => toggleSidebar('primary')}
          />
        )}
      </div>
      <nav className="operations-nav" aria-label={navigationLabel}>
        {navigationLink(home, primaryRail)}
        {canOpenConcert && (
          <button
            ref={concertTrigger}
            className={inConcert ? 'active' : undefined}
            type="button"
            aria-expanded={narrow ? drawerConcert : concertOpen}
            aria-controls="operations-concert-navigation"
            {...railLabel(concertLabel, primaryRail)}
            onClick={() => {
              if (narrow) setDrawerConcert(true);
              else setDisclosure({ locationKey: location.key, expanded: !concertOpen });
            }}
          >
            <ListMusic aria-hidden size={18} strokeWidth={1.8} />
            <span className="operations-sidebar-label">{concertLabel}</span>
            <ChevronRight
              aria-hidden
              size={16}
              className="operations-concert-chevron operations-sidebar-label"
            />
          </button>
        )}
        {navigation.map((item) => navigationLink(item, primaryRail))}
      </nav>
      <div className="operations-sidebar-footer">
        <button type="button" onClick={logOut} {...railLabel(logoutLabel, primaryRail)}>
          <LogOut aria-hidden size={17} />
          <span className="operations-sidebar-label">{logoutLabel}</span>
        </button>
      </div>
    </aside>
  );

  const isAdmin = mode === 'admin';
  const legacyConcerts = '/admin/concerts';
  const allConcerts = isAdmin ? '/admin/events' : '/organizer/events';
  const create = isAdmin ? `${legacyConcerts}?create=1` : '/organizer/events/new';
  const creating = isAdmin
    ? pathname === legacyConcerts && new URLSearchParams(location.search).get('create') === '1'
    : pathname === create;
  const review = '/admin/event-review';
  const performanceOperations = '/admin/performance-operations';
  const allConcertsLabel = translate('shared:operationsAllConcerts');
  const createLabel = translate(
    isAdmin ? 'shared:operationsCreateForOrganization' : 'performances:createConcert',
  );
  const reportLabel = translate('concert-directory:openReport');
  const reportParameters = new URLSearchParams(location.search);
  reportParameters.delete('returnTo');
  const reportQuery =
    activeConcert &&
    new URLSearchParams({
      returnTo: pathname + (reportParameters.size ? '?' + reportParameters : ''),
      ...(activeConcert.eventId ? { eventId: activeConcert.eventId } : {}),
      ...(activeConcert.performanceId ? { performanceId: activeConcert.performanceId } : {}),
      ...(activeConcert.concertId ? { concertId: activeConcert.concertId } : {}),
    });
  const concertSidebar = canOpenConcert && (
    <aside
      id="operations-concert-navigation"
      className="operations-concert-sidebar"
      data-collapsed={concertRail || undefined}
      hidden={narrow ? !drawerConcert : !concertOpen}
    >
      {narrow ? (
        <button
          className="operations-navigation-back"
          type="button"
          onClick={backToMainNavigation}
          ref={drawerBack}
        >
          <ArrowLeft aria-hidden size={18} />
          {translate('shared:operationsBackToNavigation')}
        </button>
      ) : (
        <div className="operations-concert-title">
          <span className="operations-sidebar-label">{concertLabel}</span>
          <SidebarToggle
            sidebar="concert"
            collapsed={concertRail}
            controls="operations-concert-navigation"
            onClick={() => toggleSidebar('concert')}
          />
        </div>
      )}
      <nav className="operations-nav" aria-label={translate('shared:operationsConcertNavigation')}>
        <Link
          to={allConcerts}
          aria-current={
            !creating && (pathname === allConcerts || (isAdmin && pathname === legacyConcerts))
              ? 'page'
              : undefined
          }
          onClick={closeDrawerOnNavigation}
          {...railLabel(allConcertsLabel, concertRail)}
        >
          <CalendarDays aria-hidden size={18} />
          <span className="operations-sidebar-label">{allConcertsLabel}</span>
        </Link>
        {isAdmin && (
          <>
            {navigationLink(
              { to: review, label: translate('shared:releaseQueue'), icon: ClipboardCheck },
              concertRail,
            )}
            {navigationLink(
              {
                to: performanceOperations,
                label: translate('performances:operations'),
                icon: Gauge,
              },
              concertRail,
            )}
          </>
        )}
        <Link
          to={create}
          aria-current={creating ? 'page' : undefined}
          onClick={closeDrawerOnNavigation}
          {...railLabel(createLabel, concertRail)}
        >
          <Ticket aria-hidden size={18} />
          <span className="operations-sidebar-label">{createLabel}</span>
        </Link>
        {activeConcert && (
          <div className="operations-concert-context" role="group" aria-label={activeConcert.title}>
            <p className="operations-sidebar-label">{activeConcert.title}</p>
            {activeConcert.links.map(({ icon: Icon, ...link }) => (
              <Link
                key={link.to}
                to={link.to}
                state={link.state}
                aria-current={link.current ? 'page' : undefined}
                {...railLabel(link.label, concertRail)}
                onClick={(event) => {
                  if (isPlainLinkClick(event)) link.onClick?.(event);
                  closeDrawerOnNavigation(event);
                }}
              >
                {concertRail && <Icon aria-hidden size={18} />}
                <span className="operations-sidebar-label">{link.label}</span>
              </Link>
            ))}
            {reportQuery && (
              <Link
                to={workspaceHome + '/reports?' + reportQuery}
                {...railLabel(reportLabel, concertRail)}
                onClick={(event) => {
                  if (
                    isPlainLinkClick(event) &&
                    activeConcert.canLeave &&
                    !activeConcert.canLeave()
                  )
                    event.preventDefault();
                  closeDrawerOnNavigation(event);
                }}
              >
                {concertRail && <BarChart3 aria-hidden size={18} />}
                <span className="operations-sidebar-label">{reportLabel}</span>
              </Link>
            )}
          </div>
        )}
      </nav>
    </aside>
  );

  return (
    <div
      className="operations-shell"
      data-theme={theme}
      data-concert-open={!narrow && concertOpen ? 'true' : undefined}
    >
      {narrow ? (
        <dialog
          ref={drawer}
          id="operations-navigation-drawer"
          className="operations-navigation-drawer"
          aria-label={navigationLabel}
          onClose={() => {
            setDrawerOpen(false);
            drawerTrigger.current?.focus();
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeDrawer();
          }}
        >
          <button
            className="operations-navigation-close"
            type="button"
            aria-label={translate('shared:operationsLayout_dongDieuHuong')}
            onClick={closeDrawer}
          >
            <X aria-hidden size={20} />
          </button>
          {primarySidebar}
          {concertSidebar}
        </dialog>
      ) : (
        <>
          {primarySidebar}
          {concertSidebar}
        </>
      )}

      <div className="operations-main">
        <header className="operations-topbar">
          <button
            ref={drawerTrigger}
            className="operations-menu-button"
            type="button"
            aria-label={translate('shared:operationsLayout_moDieuHuong')}
            aria-expanded={narrow && drawerOpen}
            aria-controls={narrow ? 'operations-navigation-drawer' : undefined}
            onClick={openDrawer}
          >
            <Menu aria-hidden size={20} />
          </button>
          <div
            className={
              mode === 'organizer'
                ? 'operations-context organization-context'
                : 'operations-context'
            }
          >
            {mode === 'organizer' && organization?.memberships.length ? (
              <WorkspaceSelect
                className="operations-organization-select"
                label={translate('shared:operationsLayout_toChucDangLamViec')}
                value={organization.selected?.id ?? ''}
                onChange={(id) => {
                  const destination = organization.memberships.find((entry) => entry.id === id);
                  if (!destination || id === organization.selected?.id) return;
                  organization.choose(id);
                  const reportRoute = [
                    '/organizer/reports',
                    '/organizer/reconciliation',
                    '/organizer/revenue',
                  ].includes(pathname);
                  if (
                    !reportRoute ||
                    !destination.grants.some((grant) => grant === 'EVENTS' || grant === 'FINANCE')
                  ) {
                    navigate('/organizer', { replace: true });
                    return;
                  }
                  const currentView =
                    pathname === '/organizer/reconciliation'
                      ? 'reconciliation'
                      : pathname === '/organizer/revenue'
                        ? 'revenue'
                        : new URLSearchParams(location.search).get('view');
                  const view =
                    currentView === 'reconciliation' ||
                    currentView === 'revenue' ||
                    currentView === 'operations'
                      ? currentView
                      : '';
                  navigate(
                    '/organizer/reports' + (view ? '?' + new URLSearchParams({ view }) : ''),
                    { replace: true },
                  );
                }}
                options={organization.memberships.map(({ id, name }) => ({
                  value: id,
                  label: name,
                }))}
                disabled={organization.loading}
              />
            ) : (
              <strong>TicketBox Vietnam</strong>
            )}
          </div>
          <div className="operations-account">
            <div className="operations-preferences">
              <WorkspaceSelect
                className="operations-language-select"
                label={translate('language')}
                value={currentLanguage()}
                onChange={(language) => void selectLanguage(language as Language)}
                options={languages.map(({ code, name }) => ({
                  value: code,
                  label: name,
                  lang: code,
                }))}
              />
              <button
                type="button"
                className="operations-theme-toggle"
                aria-label={themeAction}
                title={themeAction}
                onClick={switchTheme}
              >
                {dark ? <Sun size={19} aria-hidden /> : <Moon size={19} aria-hidden />}
              </button>
            </div>
            <button
              type="button"
              aria-expanded={accountOpen}
              onClick={() => setAccountOpen((value) => !value)}
            >
              <span className="operations-avatar">{user?.fullName.slice(0, 2).toUpperCase()}</span>
              <span>
                <strong>{user?.fullName}</strong>
                <small>
                  {mode === 'organizer'
                    ? translate('shared:operationsLayout_nhaToChuc')
                    : user
                      ? roleLabel(user.role)
                      : ''}
                </small>
              </span>
              <ChevronDown aria-hidden="true" size={16} />
            </button>
            {accountOpen ? (
              <div className="operations-account-menu">
                {mode === 'organizer' && user?.role === 'ADMIN' && (
                  <Link
                    className="internal-profile-link"
                    to="/admin"
                    onClick={() => setAccountOpen(false)}
                  >
                    {translate('shared:roleRoutes_quanTriHeThong')}
                  </Link>
                )}
                <Link
                  className="internal-profile-link"
                  to={workspaceHome}
                  onClick={() => setAccountOpen(false)}
                >
                  <Settings aria-hidden="true" size={16} />
                  {translate('shared:operationsLayout_veTongQuan')}
                </Link>
                <button type="button" className="operations-danger-menu-item" onClick={logOut}>
                  <LogOut aria-hidden="true" size={16} />
                  {translate('shared:operationsLayout_dangXuat')}
                </button>
              </div>
            ) : null}
          </div>
        </header>
        <main className="operations-content">
          <div
            key={`${location.pathname}:${organization?.selected?.id ?? ''}`}
            className="route-transition"
          >
            <WorkspaceRouteBoundary>
              <Outlet context={setConcert} />
            </WorkspaceRouteBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
