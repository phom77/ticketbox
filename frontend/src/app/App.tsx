import { translate } from '../i18n';
import { useTranslation } from 'react-i18next';
import { ReconciliationPage } from '../pages/organizer/ReconciliationPage';
import { OrganizationProvider, RequireOrganizationGrant } from '../features/organizations/OrganizationProvider';
import { AdminOrganizationsPage } from '../pages/admin/AdminOrganizationsPage';
import { OrganizationMembersPage } from '../pages/organizer/OrganizationMembersPage';
import { useLayoutEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { OperationsLayout } from '../components/layout/OperationsLayout';
import { PublicLayout } from '../components/layout/PublicLayout';
import { ToastProvider } from '../components/feedback/ToastProvider';
import { AuthProvider } from '../features/auth/AuthContext';
import { CatalogueRoute, ProtectedRoute } from '../features/auth/ProtectedRoute';
import { AdminArtistBioPage } from '../pages/admin/AdminArtistBioPage';
import { AdminConcertsPage } from '../pages/admin/AdminConcertsPage';
import { ConcertWorkspacePage } from '../pages/admin/ConcertWorkspacePage';
import { AdminGuestImportsPage } from '../pages/admin/AdminGuestImportsPage';
import { AdminNotificationsPage } from '../pages/admin/AdminNotificationsPage';
import { AdminOrdersPage } from '../pages/admin/AdminOrdersPage';
import { AdminOverviewPage } from '../pages/admin/AdminOverviewPage';
import { AdminTicketTypesPage } from '../pages/admin/AdminTicketTypesPage';
import { AdminUsersPage } from '../pages/admin/AdminUsersPage';
import { BookingConfirmationPage } from '../pages/customer/BookingConfirmationPage';
import { CheckoutPage } from '../pages/customer/CheckoutPage';
import { MyTicketsPage } from '../pages/customer/MyTicketsPage';
import { NotificationsPage } from '../pages/customer/NotificationsPage';
import { PaymentResultPage } from '../pages/customer/PaymentResultPage';
import { ProfilePage } from '../pages/customer/ProfilePage';
import { SeatSelectionPage } from '../pages/customer/SeatSelectionPage';
import { WaitingRoomPage } from '../pages/customer/WaitingRoomPage';
import { OrganizerOverviewPage } from '../pages/organizer/OrganizerOverviewPage';
import { OrganizerRevenuePage } from '../pages/organizer/OrganizerRevenuePage';
import { ConcertDetailPage } from '../pages/public/ConcertDetailPage';
import { HomePage } from '../pages/public/HomePage';
import { LoginPage } from '../pages/public/LoginPage';
import { RequestPasswordResetPage, ResetPasswordPage } from '../pages/public/PasswordRecoveryPage';
import { RegisterPage } from '../pages/public/RegisterPage';

const audiencePage = (page: React.ReactNode) => (
  <ProtectedRoute allowedRoles={['AUDIENCE']} redirectUnauthorized>{page}</ProtectedRoute>
);

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
              <Route path="/concerts/:id" element={<ConcertDetailPage />} />
              <Route path="/concerts/:id/waiting-room" element={audiencePage(<WaitingRoomPage />)} />
              <Route path="/concerts/:id/seats" element={audiencePage(<SeatSelectionPage />)} />
              <Route path="/checkout" element={audiencePage(<CheckoutPage />)} />
              <Route path="/booking-confirmation" element={audiencePage(<BookingConfirmationPage />)} />
              <Route path="/payment/result" element={audiencePage(<PaymentResultPage />)} />
              <Route path="/my-tickets" element={audiencePage(<MyTicketsPage />)} />
              <Route path="/notifications" element={audiencePage(<NotificationsPage />)} />
              <Route path="/profile" element={audiencePage(<ProfilePage />)} />
            </Route>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<RequestPasswordResetPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <OperationsLayout mode="admin" />
                </ProtectedRoute>
              }
            >
              <Route index element={<AdminOverviewPage />} />
              <Route path="concerts" element={<AdminConcertsPage />} />
              <Route path="concerts/:id" element={<ConcertWorkspacePage />} />
              <Route path="artist-bio" element={<AdminArtistBioPage />} />
              <Route path="ticket-types" element={<AdminTicketTypesPage />} />
              <Route path="guests" element={<AdminGuestImportsPage />} />
              <Route path="orders" element={<AdminOrdersPage />} />
              <Route path="reconciliation" element={<ReconciliationPage scope="admin" />} />
              <Route path="notifications" element={<AdminNotificationsPage />} />
              <Route path="users" element={<AdminUsersPage />} />
              <Route path="organizations" element={<AdminOrganizationsPage />} />
              <Route path="batch-logs" element={<Navigate to="/admin/guests" replace />} />
            </Route>
            <Route
              path="/organizer"
              element={
                <ProtectedRoute>
                  <OrganizationProvider>
                    <OperationsLayout mode="organizer" />
                  </OrganizationProvider>
                </ProtectedRoute>
              }
            >
              <Route index element={<OrganizerOverviewPage />} />
              <Route path="concerts" element={<RequireOrganizationGrant grant="EVENTS"><AdminConcertsPage apiScope="organizer" /></RequireOrganizationGrant>} />
              <Route path="concerts/:id/preview" element={<RequireOrganizationGrant grant="EVENTS"><ConcertDetailPage preview /></RequireOrganizationGrant>} />
              <Route path="concerts/:id" element={<RequireOrganizationGrant grant="EVENTS"><ConcertWorkspacePage apiScope="organizer" /></RequireOrganizationGrant>} />
              <Route path="ticket-types" element={<RequireOrganizationGrant grant="EVENTS"><AdminTicketTypesPage apiScope="organizer" /></RequireOrganizationGrant>} />
              <Route path="guests" element={<RequireOrganizationGrant grant="EVENTS"><AdminGuestImportsPage apiScope="organizer" uploadMode="scheduled" /></RequireOrganizationGrant>} />
              <Route path="artist-bio" element={<RequireOrganizationGrant grant="EVENTS"><AdminArtistBioPage apiScope="organizer" /></RequireOrganizationGrant>} />
              <Route path="reconciliation" element={<RequireOrganizationGrant grant="FINANCE"><ReconciliationPage scope="organizer" /></RequireOrganizationGrant>} />
              <Route path="revenue" element={<RequireOrganizationGrant grant="FINANCE"><OrganizerRevenuePage /></RequireOrganizationGrant>} />
              <Route path="orders" element={<RequireOrganizationGrant grant="FINANCE"><AdminOrdersPage apiScope="organizer" /></RequireOrganizationGrant>} />
              <Route path="members" element={<RequireOrganizationGrant grant="MEMBERS"><OrganizationMembersPage /></RequireOrganizationGrant>} />
            </Route>
            <Route path="/staff/*" element={
              <ProtectedRoute allowedRoles={['STAFF']}>
                <main className="route-forbidden page-width">
                  <div className="state-panel" role="status">
                    <h1>{translate("shared:app_soatVeChuaMo")}</h1>
                    <p>{translate("shared:app_tinhNangSeMoCungPhienBan")}</p>
                  </div>
                </main>
              </ProtectedRoute>
            } />
            <Route path="*" element={<Navigate to="/" replace />} />
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
