import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthContext';
import { getRoleHome, getRoleHomeLabel } from '../../features/auth/roleRoutes';
import '../../components/feedback/buyerFeedback.css';

/** Shown for any URL that matches no route, keeping the address so it can be reported or fixed. */
export function NotFoundPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const heading = useRef<HTMLHeadingElement>(null);
  const canBrowse = !user || user.role === 'AUDIENCE' || user.role === 'ORGANIZER';
  const home = getRoleHome(user?.role);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section className="buyer-page page-width not-found-page" aria-labelledby="not-found-title">
      <div className="buyer-state" data-tone="empty">
        <p className="not-found-code" aria-hidden="true">
          404
        </p>
        <h1 id="not-found-title" ref={heading} tabIndex={-1}>
          {t('shared:notFound_title')}
        </h1>
        <p>{t('shared:notFound_body')}</p>
        <p className="not-found-path">{t('shared:notFound_path', { path: pathname })}</p>
        <div className="buyer-state-actions">
          <Link className="button button-primary" to={home}>
            {getRoleHomeLabel(user?.role)}
          </Link>
          {canBrowse && home !== '/events' ? (
            <Link className="button button-secondary" to="/events">
              {t('shared:notFound_browse')}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
