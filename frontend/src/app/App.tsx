import { EventDetailPage } from '../pages/public/EventDetailPage';
import { translate } from '../i18n';
import { useTranslation } from 'react-i18next';
import {
  OrganizationProvider,
  RequireOrganizationGrant,
  RequireOrganizationMembership,
} from '../features/organizations/OrganizationProvider';
import { useLayoutEffect } from 'react';
import { lazyNamed } from './lazyNamed';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { OperationsLayout } from '../components/layout/OperationsLayout';
import { PublicLayout } from '../components/layout/PublicLayout';
import { ToastProvider } from '../components/feedback/ToastProvider';
import { AuthProvider } from '../features/auth/AuthContext';
import { CatalogueRoute, ProtectedRoute } from '../features/auth/ProtectedRoute';
import {
  BookingConfirmationPage,
  OrderConfirmationPage,
} from '../pages/customer/BookingConfirmationPage';
import { CheckoutPage } from '../pages/customer/CheckoutPage';
import { MyTicketsPage } from '../pages/customer/MyTicketsPage';
import { NotificationsPage } from '../pages/customer/NotificationsPage';
import { PaymentResultPage } from '../pages/customer/PaymentResultPage';
import { LegacyProfileRedirect, ProfilePage } from '../pages/customer/ProfilePage';
import { OrderDetailPage } from '../pages/customer/OrderDetailPage';
import { TicketDetailPage } from '../pages/customer/TicketDetailPage';
import '../pages/public/Performances.css';
import { TicketSelectionPage } from '../pages/customer/TicketSelectionPage';
import { WaitingRoomPage } from '../pages/customer/WaitingRoomPage';
import EventCataloguePage from '../pages/public/EventCataloguePage';
import { HomePage } from '../pages/public/HomePage';
import { LoginPage } from '../pages/public/LoginPage';
import { NotFoundPage } from '../pages/public/NotFoundPage';
import { RequestPasswordResetPage, ResetPasswordPage } from '../pages/public/PasswordRecoveryPage';
import { RegisterPage } from '../pages/public/RegisterPage';
import {
  OrganizerApplicationPage,
  OrganizerActivationPage,
} from '../pages/public/OrganizerAccessPages';

// Admin and Organizer workspace pages load on demand, so buyer pages do not
// download them. OperationsLayout shows their loading and failure states.
const PerformanceOperationsPage = lazyNamed(
  () => import('../pages/admin/PerformanceOperationsPage'),
  'PerformanceOperationsPage',
);
const NewPerformanceEventPage = lazyNamed(
  () => import('../pages/organizer/PerformanceEventsPage'),
  'NewPerformanceEventPage',
);
const PerformanceEventAccess = lazyNamed(
  () => import('../pages/organizer/PerformanceEventsPage'),
  'PerformanceEventAccess',
);
const PerformanceEventPage = lazyNamed(
  () => import('../pages/organizer/PerformanceEventsPage'),
  'PerformanceEventPage',
);
const ConcertDirectoryPage = lazyNamed(
  () => import('../pages/operations/ConcertDirectoryPage'),
  'ConcertDirectoryPage',
);
const AdminEventWorkspacePage = lazyNamed(
  () => import('../pages/admin/AdminEventWorkspacePage'),
  'AdminEventWorkspacePage',
);
const AdminSettingsPage = lazyNamed(
  () => import('../pages/admin/AdminSettingsPage'),
  'AdminSettingsPage',
);
const OperationsReportsPage = lazyNamed(
  () => import('../pages/operations/OperationsReportsPage'),
  'OperationsReportsPage',
);
const ReconciliationPage = lazyNamed(
  () => import('../pages/organizer/ReconciliationPage'),
  'ReconciliationPage',
);
const AdminOrganizationsPage = lazyNamed(
  () => import('../pages/admin/AdminOrganizationsPage'),
  'AdminOrganizationsPage',
);
const OrganizationMembersPage = lazyNamed(
  () => import('../pages/organizer/OrganizationMembersPage'),
  'OrganizationMembersPage',
);
const AdminArtistBioPage = lazyNamed(
  () => import('../pages/admin/AdminArtistBioPage'),
  'AdminArtistBioPage',
);
const AdminConcertsPage = lazyNamed(
  () => import('../pages/admin/AdminConcertsPage'),
  'AdminConcertsPage',
);
const ConcertWorkspacePage = lazyNamed(
  () => import('../pages/admin/ConcertWorkspacePage'),
  'ConcertWorkspacePage',
);
const AdminGuestImportsPage = lazyNamed(
  () => import('../pages/admin/AdminGuestImportsPage'),
  'AdminGuestImportsPage',
);
const AdminNotificationsPage = lazyNamed(
  () => import('../pages/admin/AdminNotificationsPage'),
  'AdminNotificationsPage',
);
const AdminOrdersPage = lazyNamed(
  () => import('../pages/admin/AdminOrdersPage'),
  'AdminOrdersPage',
);
const AdminOverviewPage = lazyNamed(
  () => import('../pages/admin/AdminOverviewPage'),
  'AdminOverviewPage',
);
const AdminPublicationQueuePage = lazyNamed(
  () => import('../pages/admin/AdminPublicationQueuePage'),
  'AdminPublicationQueuePage',
);
const AdminTicketTypesPage = lazyNamed(
  () => import('../pages/admin/AdminTicketTypesPage'),
  'AdminTicketTypesPage',
);
const AdminUsersPage = lazyNamed(() => import('../pages/admin/AdminUsersPage'), 'AdminUsersPage');
const OrganizerOverviewPage = lazyNamed(
  () => import('../pages/organizer/OrganizerOverviewPage'),
  'OrganizerOverviewPage',
);
const OrganizerRevenuePage = lazyNamed(
  () => import('../pages/organizer/OrganizerRevenuePage'),
  'OrganizerRevenuePage',
);

const audiencePage = (page: React.ReactNode) => (
  <ProtectedRoute allowedRoles={['AUDIENCE']} redirectUnauthorized>
    {page}
  </ProtectedRoute>
);

/** Legacy concert links keep working: a concert id is also its event id (ADR 0003). */
function ConcertRedirect() {
  const { id = '' } = useParams();
  const { search, hash } = useLocation();
  return <Navigate replace to={{ pathname: '/events/' + encodeURIComponent(id), search, hash }} />;
}

/** The earlier seat routes now land on Choose tickets. */
function SeatsRedirect() {
  const { id = '', eventId } = useParams();
  const { search, hash } = useLocation();
  const pathname = eventId
    ? '/events/' +
      encodeURIComponent(eventId) +
      '/performances/' +
      encodeURIComponent(id) +
      '/tickets'
    : '/events/' + encodeURIComponent(id) + '/tickets';
  return <Navigate replace to={{ pathname, search, hash }} />;
}

const cataloguePage = (page: React.ReactNode) => <CatalogueRoute>{page}</CatalogueRoute>;

export function App() {
  useTranslation();
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="/" element={cataloguePage(<HomePage />)} />
              <Route path="/events" element={cataloguePage(<EventCataloguePage />)} />
              <Route path="/events/:eventId" element={cataloguePage(<EventDetailPage />)} />
              <Route
                path="/events/:eventId/performances/:id/waiting-room"
                element={audiencePage(<WaitingRoomPage />)}
              />
              <Route
                path="/events/:eventId/performances/:id/tickets"
                element={audiencePage(<TicketSelectionPage />)}
              />
              <Route path="/events/:eventId/performances/:id/seats" element={<SeatsRedirect />} />
              <Route
                path="/events/:eventId/tickets"
                element={audiencePage(<TicketSelectionPage />)}
              />
              <Route path="/concerts/:id" element={cataloguePage(<ConcertRedirect />)} />
              <Route
                path="/concerts/:id/waiting-room"
                element={audiencePage(<WaitingRoomPage />)}
              />
              <Route path="/concerts/:id/seats" element={<SeatsRedirect />} />
              <Route path="/checkout" element={audiencePage(<CheckoutPage />)} />
              <Route
                path="/booking-confirmation"
                element={audiencePage(<BookingConfirmationPage />)}
              />
              <Route
                path="/orders/:orderId/confirmation"
                element={audiencePage(<OrderConfirmationPage />)}
              />
              <Route path="/payment/result" element={audiencePage(<PaymentResultPage />)} />
              <Route path="/my-tickets" element={audiencePage(<MyTicketsPage />)} />
              <Route path="/notifications" element={audiencePage(<NotificationsPage />)} />
              <Route path="/my-tickets/:ticketId" element={audiencePage(<TicketDetailPage />)} />
              <Route path="/profile" element={<LegacyProfileRedirect />} />
              <Route path="/account" element={audiencePage(<ProfilePage />)} />
              <Route
                path="/account/orders"
                element={audiencePage(<ProfilePage section="orders" />)}
              />
              <Route path="/account/orders/:orderId" element={audiencePage(<OrderDetailPage />)} />
              <Route
                path="/account/security"
                element={audiencePage(<ProfilePage section="security" />)}
              />
              <Route
                path="/account/preferences"
                element={audiencePage(<ProfilePage section="preferences" />)}
              />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<RequestPasswordResetPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/partner/apply" element={<OrganizerApplicationPage />} />
            <Route path="/partner/activate" element={<OrganizerActivationPage />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <OperationsLayout mode="admin" />
                </ProtectedRoute>
              }
            >
              <Route index element={<AdminOverviewPage />} />
              <Route path="events" element={<ConcertDirectoryPage scope="admin" />} />
              <Route path="events/:eventId" element={<AdminEventWorkspacePage />} />
              <Route path="performance-operations" element={<PerformanceOperationsPage />} />
              <Route path="concerts" element={<AdminConcertsPage />} />
              <Route path="event-review" element={<AdminPublicationQueuePage />} />
              <Route path="concerts/:id" element={<ConcertWorkspacePage />} />
              <Route path="artist-bio" element={<AdminArtistBioPage />} />
              <Route path="ticket-types" element={<AdminTicketTypesPage />} />
              <Route path="guests" element={<AdminGuestImportsPage />} />
              <Route path="orders" element={<AdminOrdersPage />} />
              <Route path="reports" element={<OperationsReportsPage scope="admin" />} />
              <Route path="settings" element={<AdminSettingsPage />} />
              <Route path="reconciliation" element={<ReconciliationPage scope="admin" />} />
              <Route path="notifications" element={<AdminNotificationsPage />} />
              <Route path="users" element={<AdminUsersPage />} />
              <Route path="organizations" element={<AdminOrganizationsPage />} />
              <Route path="batch-logs" element={<Navigate to="/admin/guests" replace />} />
            </Route>
            <Route
              path="/organizer"
              element={
                <ProtectedRoute allowedRoles={['ORGANIZER', 'ADMIN']} redirectUnauthorized>
                  <OrganizationProvider>
                    <RequireOrganizationMembership>
                      <OperationsLayout mode="organizer" />
                    </RequireOrganizationMembership>
                  </OrganizationProvider>
                </ProtectedRoute>
              }
            >
              <Route index element={<OrganizerOverviewPage />} />
              <Route
                path="events"
                element={
                  <PerformanceEventAccess>
                    <ConcertDirectoryPage scope="organizer" />
                  </PerformanceEventAccess>
                }
              />
              <Route
                path="events/new"
                element={
                  <PerformanceEventAccess>
                    <NewPerformanceEventPage />
                  </PerformanceEventAccess>
                }
              />
              <Route
                path="events/:eventId"
                element={
                  <PerformanceEventAccess>
                    <PerformanceEventPage />
                  </PerformanceEventAccess>
                }
              />
              <Route
                path="concerts"
                element={
                  <RequireOrganizationGrant grant="EVENTS">
                    <AdminConcertsPage apiScope="organizer" />
                  </RequireOrganizationGrant>
                }
              />
              <Route
                path="concerts/:id/preview"
                element={
                  <RequireOrganizationGrant grant="EVENTS">
                    <EventDetailPage preview />
                  </RequireOrganizationGrant>
                }
              />
              <Route
                path="concerts/:id"
                element={
                  <RequireOrganizationGrant grant="EVENTS">
                    <ConcertWorkspacePage apiScope="organizer" />
                  </RequireOrganizationGrant>
                }
              />
              <Route
                path="ticket-types"
                element={
                  <RequireOrganizationGrant grant="EVENTS">
                    <AdminTicketTypesPage apiScope="organizer" />
                  </RequireOrganizationGrant>
                }
              />
              <Route
                path="guests"
                element={
                  <RequireOrganizationGrant grant="EVENTS">
                    <AdminGuestImportsPage apiScope="organizer" uploadMode="scheduled" />
                  </RequireOrganizationGrant>
                }
              />
              <Route
                path="artist-bio"
                element={
                  <RequireOrganizationGrant grant="EVENTS">
                    <AdminArtistBioPage apiScope="organizer" />
                  </RequireOrganizationGrant>
                }
              />
              <Route path="reports" element={<OperationsReportsPage scope="organizer" />} />
              <Route
                path="reconciliation"
                element={
                  <RequireOrganizationGrant grant="FINANCE">
                    <ReconciliationPage scope="organizer" />
                  </RequireOrganizationGrant>
                }
              />
              <Route
                path="revenue"
                element={
                  <RequireOrganizationGrant grant="FINANCE">
                    <OrganizerRevenuePage />
                  </RequireOrganizationGrant>
                }
              />
              <Route
                path="orders"
                element={
                  <RequireOrganizationGrant grant="FINANCE">
                    <AdminOrdersPage apiScope="organizer" />
                  </RequireOrganizationGrant>
                }
              />
              <Route
                path="members"
                element={
                  <RequireOrganizationGrant grant="MEMBERS">
                    <OrganizationMembersPage />
                  </RequireOrganizationGrant>
                }
              />
            </Route>
            <Route
              path="/staff/*"
              element={
                <ProtectedRoute allowedRoles={['STAFF']}>
                  <main className="route-forbidden page-width">
                    <div className="state-panel" role="status">
                      <h1>{translate('shared:app_soatVeChuaMo')}</h1>
                      <p>{translate('shared:app_tinhNangSeMoCungPhienBan')}</p>
                    </div>
                  </main>
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  return null;
}
