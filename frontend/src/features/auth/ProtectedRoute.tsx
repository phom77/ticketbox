import React from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth, type UserRole } from './AuthContext';
import { getRoleHome, getRoleHomeLabel } from './roleRoutes';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  redirectUnauthorized?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, redirectUnauthorized = false }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="auth-route-loading" role="status" aria-live="polite">
        <div className="route-spinner" aria-hidden="true" />
        <span className="sr-only">Checking your session</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const homePath = getRoleHome(user.role);
    const homeLabel = getRoleHomeLabel(user.role);

    if (redirectUnauthorized) {
      return <Navigate to={homePath} replace />;
    }

    return (
      <main className="route-forbidden page-width">
        <div className="state-panel" role="alert">
          <span className="state-icon" aria-hidden="true">!</span>
          <h1>Access limited</h1>
          <p>
            This area is reserved for {allowedRoles.join(' / ')} accounts. You are signed in as {user.role}.
          </p>
          <div className="forbidden-actions">
            <Link className="button button-primary" to={homePath}>{homeLabel}</Link>
            {user.role === 'AUDIENCE' ? <Link className="button button-secondary" to="/profile">View profile</Link> : null}
          </div>
        </div>
      </main>
    );
  }

  return <>{children}</>;
};

/** Public catalogue pages are for visitors and audience accounts only. */
export const GuestOrAudienceRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-route-loading" role="status" aria-live="polite">
        <div className="route-spinner" aria-hidden="true" />
        <span className="sr-only">Checking your session</span>
      </div>
    );
  }

  if (user && user.role !== 'AUDIENCE') {
    return <Navigate to={getRoleHome(user.role)} replace />;
  }

  return <>{children}</>;
};
