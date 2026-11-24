import { useTranslation } from 'react-i18next';
import './buyerFeedback.css';

/** Placeholder event cards with one status message for assistive technology. */
export function CardGridSkeleton({ count = 4, label }: { count?: number; label?: string }) {
  const { t } = useTranslation();
  return (
    <div className="buyer-skeleton-region" role="status">
      <span className="sr-only">{label ?? t('shared:skeleton_loading')}</span>
      <div className="buyer-skeleton-grid" aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <div className="buyer-skeleton-card" key={index}>
            <span className="buyer-skeleton-block buyer-skeleton-media" />
            <span className="buyer-skeleton-block buyer-skeleton-line" />
            <span className="buyer-skeleton-block buyer-skeleton-line is-short" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Placeholder for an event detail page: title, summary and a list of rows. */
export function DetailSkeleton({ rows = 3, label }: { rows?: number; label?: string }) {
  const { t } = useTranslation();
  return (
    <div className="buyer-skeleton-region buyer-skeleton-detail" role="status">
      <span className="sr-only">{label ?? t('shared:skeleton_loading')}</span>
      <div aria-hidden="true">
        <span className="buyer-skeleton-block buyer-skeleton-title" />
        <span className="buyer-skeleton-block buyer-skeleton-line" />
        <span className="buyer-skeleton-block buyer-skeleton-line is-short" />
        <div className="buyer-skeleton-rows">
          {Array.from({ length: rows }, (_, index) => (
            <span className="buyer-skeleton-block buyer-skeleton-row" key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Placeholder for a purchase panel such as a section list or order summary. */
export function PanelSkeleton({ rows = 4, label }: { rows?: number; label?: string }) {
  const { t } = useTranslation();
  return (
    <div className="buyer-skeleton-region buyer-skeleton-panel" role="status">
      <span className="sr-only">{label ?? t('shared:skeleton_loading')}</span>
      <div className="buyer-skeleton-rows" aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => (
          <span className="buyer-skeleton-block buyer-skeleton-row" key={index} />
        ))}
      </div>
    </div>
  );
}
