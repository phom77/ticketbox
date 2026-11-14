import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth, type UserRole } from './AuthContext';
import { getRoleHome, getRoleHomeLabel } from './roleRoutes';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  redirectUnauthorized?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, redirectUnauthorized = false }) => {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="auth-route-loading" role="status" aria-live="polite">
        <div className="route-spinner" aria-hidden="true" />
        <span className="sr-only">{t('sessionChecking')}</span>
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
          <h1>{t('accessLimited')}</h1>
          <p>{t('accessRoleRequired', {
            allowedRoles: allowedRoles.map((role) => t(`role_${role}`)).join(' / '),
            currentRole: t(`role_${user.role}`),
          })}</p>
          <div className="forbidden-actions">
            <Link className="button button-primary" to={homePath}>{homeLabel}</Link>
            {user.role === 'AUDIENCE' ? <Link className="button button-secondary" to="/profile">{t('viewProfile')}</Link> : null}
          </div>
        </div>
      </main>
    );
  }

  return <>{children}</>;
};

export const CatalogueRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-route-loading" role="status" aria-live="polite">
        <div className="route-spinner" aria-hidden="true" />
        <span className="sr-only">{t('sessionChecking')}</span>
      </div>
    );
  }

  if (user && user.role !== 'AUDIENCE' && user.role !== 'ORGANIZER') {
    return <Navigate to={getRoleHome(user.role)} replace />;
  }

  return <>{children}</>;
};
