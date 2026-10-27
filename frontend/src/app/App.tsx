import { useLayoutEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { OperationsLayout } from '../components/layout/OperationsLayout';
import { PublicLayout } from '../components/layout/PublicLayout';
import { ToastProvider } from '../components/feedback/ToastProvider';
import { AuthProvider } from '../features/auth/AuthContext';
import { GuestOrAudienceRoute, ProtectedRoute } from '../features/auth/ProtectedRoute';
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
import { RegisterPage } from '../pages/public/RegisterPage';
import { StaffCheckInPage } from '../pages/staff/StaffCheckInPage';
import { StaffGuestsPage } from '../pages/staff/StaffGuestsPage';
import { StaffHistoryPage } from '../pages/staff/StaffHistoryPage';
import { StaffOverviewPage } from '../pages/staff/StaffOverviewPage';

const audiencePage = (page: React.ReactNode) => (
  <ProtectedRoute allowedRoles={['AUDIENCE']} redirectUnauthorized>{page}</ProtectedRoute>
);

const cataloguePage = (page: React.ReactNode) => <GuestOrAudienceRoute>{page}</GuestOrAudienceRoute>;

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="/" element={cataloguePage(<HomePage />)} />
              <Route path="/concerts/:id" element={cataloguePage(<ConcertDetailPage />)} />
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
              <Route path="notifications" element={<AdminNotificationsPage />} />
              <Route path="users" element={<AdminUsersPage />} />
              <Route path="batch-logs" element={<Navigate to="/admin/guests" replace />} />
            </Route>
            <Route
              path="/organizer"
              element={
                <ProtectedRoute allowedRoles={['ORGANIZER']}>
                  <OperationsLayout mode="organizer" />
                </ProtectedRoute>
              }
            >
              <Route index element={<OrganizerOverviewPage />} />
              <Route path="concerts" element={<AdminConcertsPage apiScope="organizer" />} />
              <Route path="concerts/:id" element={<ConcertWorkspacePage apiScope="organizer" />} />
              <Route path="ticket-types" element={<AdminTicketTypesPage apiScope="organizer" />} />
              <Route path="guests" element={<AdminGuestImportsPage apiScope="organizer" uploadMode="scheduled" />} />
              <Route path="artist-bio" element={<AdminArtistBioPage apiScope="organizer" />} />
              <Route path="revenue" element={<OrganizerRevenuePage />} />
              <Route path="orders" element={<AdminOrdersPage apiScope="organizer" />} />
            </Route>
            <Route
              path="/staff"
              element={
                <ProtectedRoute allowedRoles={['STAFF']}>
                  <OperationsLayout mode="staff" />
                </ProtectedRoute>
              }
            >
              <Route index element={<StaffOverviewPage />} />
              <Route path="check-in" element={<StaffCheckInPage />} />
              <Route path="guests" element={<StaffGuestsPage />} />
              <Route path="history" element={<StaffHistoryPage />} />
            </Route>
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
