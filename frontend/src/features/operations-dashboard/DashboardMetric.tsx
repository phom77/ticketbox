import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ApiClientError } from '../../api/client';
import { numberFormatter } from '../../data/formatters';
import './dashboard.css';

type Result<T> =
  | { status: 'loading' }
  | { status: 'error'; forbidden: boolean }
  | { status: 'ready'; data: { totalElements: number; content: T[] } };

const dashboardNumber = numberFormatter();

export function DashboardMetric<T>({
  title,
  to,
  load,
  description,
  empty,
  renderItem,
}: {
  title: string;
  to: string;
  load: (signal: AbortSignal) => Promise<{ totalElements: number; content: T[] }>;
  description?: string;
  empty?: string;
  renderItem?: (item: T) => ReactNode;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const region = useRef<HTMLElement>(null);
  const [result, setResult] = useState<Result<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setResult({
            status: 'error',
            forbidden: error instanceof ApiClientError && error.status === 403,
          });
        }
      });
    return () => controller.abort();
  }, [attempt, load]);

  return (
    <section
      ref={region}
      className="operations-dashboard-metric"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <h3>
        {result.status === 'ready' ? (
          <Link className="operations-dashboard-total" to={to}>
            <span id={titleId}>{title}</span>{' '}
            <strong>{dashboardNumber.format(result.data.totalElements)}</strong>
            <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        ) : (
          <span id={titleId}>{title}</span>
        )}
      </h3>
      {description && <p className="operations-dashboard-caption">{description}</p>}
      {result.status === 'loading' && (
        <p className="operations-dashboard-caption" role="status">
          {t('operations-dashboard:loading')}
        </p>
      )}
      {result.status === 'error' && (
        <div className="operations-dashboard-error">
          <p role="alert">
            {t(
              result.forbidden
                ? 'operations-dashboard:forbidden'
                : 'operations-dashboard:loadError',
            )}
          </p>
          <button
            className="admin-secondary-action"
            type="button"
            onClick={() => {
              region.current?.focus();
              setResult({ status: 'loading' });
              setAttempt((value) => value + 1);
            }}
          >
            {t('operations-dashboard:retry')}
          </button>
        </div>
      )}
      {result.status === 'ready' && empty && result.data.totalElements === 0 && (
        <p className="operations-dashboard-caption">{empty}</p>
      )}
      {result.status === 'ready' && renderItem && result.data.content.length > 0 && (
        <ul className="operations-dashboard-records">{result.data.content.map(renderItem)}</ul>
      )}
    </section>
  );
}
