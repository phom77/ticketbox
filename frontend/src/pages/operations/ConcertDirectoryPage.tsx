import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import type { ManagementApiScope } from '../../api/admin';
import { getOperationsEvents, type OperationsEventRow, type OperationsPage } from '../../api/operations';
import { getApprovedOrganizations, type ApprovedOrganization } from '../../api/organizations';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { WorkspaceSelect } from '../../components/WorkspaceSelect';
import { dateFormatter, numberFormatter } from '../../data/formatters';
import './ConcertDirectoryPage.css';

const date = dateFormatter({ dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });
const number = numberFormatter();

function concertPath(scope: ManagementApiScope, concert: OperationsEventRow) {
  if (concert.legacyConcertId) return `/${scope}/concerts/${encodeURIComponent(concert.legacyConcertId)}`;
  const base = `/${scope}/events/${encodeURIComponent(concert.id)}`;
  if (scope === 'organizer' && concert.actionPerformanceId) {
    const search = new URLSearchParams({ show: concert.actionPerformanceId });
    if (concert.changesRequested) search.set('step', 'review');
    return base + '?' + search;
  }
  return base;
}

export function ConcertDirectoryPage({ scope }: { scope: ManagementApiScope }) {
  const { t } = useTranslation();
  const [parameters, setParameters] = useSearchParams();
  const query = parameters.get('q') ?? '';
  const status = parameters.get('status') ?? '';
  const organizationId = scope === 'admin' ? parameters.get('organizationId') ?? '' : '';
  const page = Math.max(0, Math.min(1_000_000, parseInt(parameters.get('page') ?? '', 10) || 0));
  const [retry, setRetry] = useState(0);
  const searchKey = JSON.stringify([scope, query, status, organizationId, page, retry]);
  const [result, setResult] = useState<{ key: string; data?: OperationsPage<OperationsEventRow>; error?: string }>();
  const [organizations, setOrganizations] = useState<ApprovedOrganization[]>([]);
  const [organizationError, setOrganizationError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void getOperationsEvents(scope, { query, status, organizationId, page }, controller.signal).then((data) => {
      if (!controller.signal.aborted) setResult({ key: searchKey, data });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setResult({ key: searchKey, error: error instanceof Error ? error.message : '' });
    });
    return () => controller.abort();
  }, [scope, query, status, organizationId, page, searchKey]);

  useEffect(() => {
    if (scope !== 'admin') return;
    const controller = new AbortController();
    void getApprovedOrganizations(controller.signal).then((data) => {
      if (!controller.signal.aborted) {
        setOrganizationError(false);
        setOrganizations(data);
      }
    }).catch(() => {
      if (!controller.signal.aborted) setOrganizationError(true);
    });
    return () => controller.abort();
  }, [scope, retry]);

  const loaded = result?.key === searchKey ? result : undefined;
  const listing = loaded?.data;
  const filtered = Boolean(query || status || organizationId || page);
  const firstOrganizerConcert = scope === 'organizer' && !filtered;
  const byId = new Map(organizations.map(({ id, name }) => [id, name]));
  const title = scope === 'admin' ? t('concert-directory:title') : t('performances:eventList');
  const path = `/${scope}/events`;

  function changeFilter(key: string, value: string) {
    const next = new URLSearchParams(parameters);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setParameters(next);
  }

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('q');
    changeFilter('q', String(value ?? '').trim());
  }

  return <>
    <AdminPageHeader title={title} actions={scope === 'organizer'
      ? <Link className="admin-primary-action" to="/organizer/events/new">{t('performances:createConcert')}</Link>
      : <Link className="admin-secondary-action" to="/admin/concerts?create=1">{t('shared:partnerCreateAssisted')}</Link>} />
    <div className="concert-directory-filters">
      <form key={query} onSubmit={applySearch}>
        <label className="admin-field">
          {t('concert-directory:search')}
          <input type="search" name="q" defaultValue={query} maxLength={160} />
        </label>
        <button className="admin-secondary-action" type="submit">{t('concert-directory:apply')}</button>
      </form>
      <label className="admin-field">
        {t('concert-directory:status')}
        <WorkspaceSelect label={t('concert-directory:status')} value={status} onChange={(value) => changeFilter('status', value)}
          options={[
            { value: '', label: t('concert-directory:allStatuses') },
            { value: 'PREPARING', label: t('concert-directory:preparing') },
            { value: 'CHANGES_REQUESTED', label: t('shared:release_CHANGES_REQUESTED') },
          ]} />
      </label>
      {scope === 'admin' && <label className="admin-field">
        {t('concert-directory:organization')}
        <WorkspaceSelect label={t('concert-directory:organization')} value={organizationId}
          onChange={(value) => changeFilter('organizationId', value)}
          options={[
            { value: '', label: t('concert-directory:allOrganizations') },
            ...organizations.map(({ id, name }) => ({ value: id, label: name })),
          ]} />
      </label>}
    </div>
    {organizationError && <p role="status">{t('concert-directory:organizationsUnavailable')}{' '}
      <button type="button" className="admin-secondary-action" onClick={() => setRetry((value) => value + 1)}>{t('performances:refresh')}</button>
    </p>}
    {!loaded && <p role="status">{t('performances:loading')}</p>}
    {loaded && !listing && <section className="admin-empty-state">
      <p role="alert">{loaded.error || t('requestFailed')}</p>
      <button className="admin-secondary-action" type="button" onClick={() => setRetry((value) => value + 1)}>{t('performances:refresh')}</button>
    </section>}
    {listing && !listing.content.length && <section className="admin-empty-state concert-directory-empty">
      <h2>{t(firstOrganizerConcert ? 'performances:noManagedEvents' : 'concert-directory:empty')}</h2>
      {firstOrganizerConcert && <p>{t('performances:noManagedEventsHelp')}</p>}
      {filtered && <Link className="admin-secondary-action" to={path}>{t('concert-directory:clearFilters')}</Link>}
    </section>}
    {listing && listing.content.length > 0 && <div className="admin-table-wrap" role="region" aria-label={title} tabIndex={0}>
      <table className="admin-table concert-directory-table">
        <thead><tr>
          <th scope="col">{t('concert-directory:name')}</th>
          {scope === 'admin' && <th scope="col">{t('concert-directory:organization')}</th>}
          <th scope="col">{t('performances:setupNextShowColumn')}</th>
          <th scope="col">{t('concert-directory:status')}</th>
        </tr></thead>
        <tbody>{listing.content.map((concert) => <tr key={concert.id}>
          <td>
            <Link className="admin-table-primary" to={concertPath(scope, concert)}
              state={{ directorySearch: parameters.toString() }}>{concert.title}</Link>
            <span className="admin-table-secondary">{t('performances:performanceCount', { count: concert.performanceCount })}</span>
          </td>
          {scope === 'admin' && <td>{concert.organizationId
            ? byId.get(concert.organizationId) ?? t('concert-directory:organizationUnavailable')
            : 'TicketBox'}</td>}
          <td>{concert.nextStartsAt ? date.format(new Date(concert.nextStartsAt)) : '—'}</td>
          <td>
            {concert.changesRequested && <strong>{t('shared:release_CHANGES_REQUESTED')}</strong>}
            {concert.changesRequested && concert.changeReason && <span className="admin-table-secondary">{concert.changeReason}</span>}
            {!concert.changesRequested && (concert.preparing ? t('concert-directory:preparing') : '—')}
          </td>
        </tr>)}</tbody>
      </table>
    </div>}
    {listing && (listing.totalElements > 0 || page > 0) && <DirectoryPagination path={path} parameters={parameters} page={listing} />}
  </>;
}

export function DirectoryPagination({ path, parameters, page }: {
  path: string;
  parameters: URLSearchParams;
  page: Pick<OperationsPage<unknown>, 'number' | 'totalPages' | 'totalElements'>;
}) {
  const { t } = useTranslation();
  const pageUrl = (number: number) => {
    const next = new URLSearchParams(parameters);
    if (number > 0) next.set('page', String(number));
    else next.delete('page');
    return next.size ? path + '?' + next : path;
  };

  return <nav className="concert-directory-pagination" aria-label={t('concert-directory:pagination')}>
    <span>{t('concert-directory:results', { total: number.format(page.totalElements) })}</span>
    {page.number > 0 && <Link className="admin-secondary-action" to={pageUrl(page.number - 1)}>{t('performances:previous')}</Link>}
    {page.number + 1 < page.totalPages && <Link className="admin-secondary-action" to={pageUrl(page.number + 1)}>{t('performances:next')}</Link>}
  </nav>;
}
