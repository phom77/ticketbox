import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Download, FilePlus2, RefreshCw } from 'lucide-react';
import { ApiClientError } from '../../api/client';
import { getOrganizationProfile, type OrganizationProfile } from '../../api/organizationProfile';
import {
  downloadStatement,
  getEligibleStatements,
  getStatements,
  issueStatement,
  type EligibleScope,
  type Statement,
  type StatementPage,
} from '../../api/statements';
import { ModalPortal } from '../../components/feedback/ModalPortal';
import { useToast } from '../../components/feedback/toast-context';
import { dateFormatter } from '../../data/formatters';
import { useOrganization } from '../organizations/OrganizationProvider';
import { integer, money } from './salesFormat';
import './StatementsView.css';

const dateTime = dateFormatter({ dateStyle: 'medium', timeStyle: 'short' });

type Target = { scope: EligibleScope } | { statement: Statement };

function reconciliationLink(statement: Statement) {
  const params = new URLSearchParams({ view: 'reconciliation' });
  if (statement.scopeType === 'PERFORMANCE') params.set('concertId', statement.scopeId);
  return `/organizer/reports?${params}`;
}

/** Reports > Statements: scopes that are ready for a statement, and the statements already issued. */
export function StatementsView() {
  const { t } = useTranslation();
  const toast = useToast();
  const organization = useOrganization();
  const organizationId = organization?.selected?.id;
  const [eligible, setEligible] = useState<StatementPage<EligibleScope>>();
  const [issued, setIssued] = useState<StatementPage<Statement>>();
  const [page, setPage] = useState(0);
  const [error, setError] = useState(false);
  const [target, setTarget] = useState<Target>();
  const [profile, setProfile] = useState<OrganizationProfile>();
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState('');

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const [ready, done] = await Promise.all([
          getEligibleStatements(undefined, 0, signal),
          getStatements(undefined, page, signal),
        ]);
        if (signal?.aborted) return;
        setEligible(ready);
        setIssued(done);
        setError(false);
      } catch (failure) {
        if (!signal?.aborted) setError(true);
        void failure;
      }
    },
    [page],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, organizationId]);

  async function confirm(next: Target) {
    setTarget(next);
    setProfile(undefined);
    if (!organizationId) return;
    try {
      setProfile(await getOrganizationProfile(organizationId));
    } catch (failure) {
      void failure;
    }
  }

  async function issue() {
    if (!target) return;
    const scope = 'scope' in target ? target.scope : undefined;
    const statement = 'statement' in target ? target.statement : undefined;
    setBusy(true);
    try {
      const result = await issueStatement(
        scope?.scopeType ?? statement!.scopeType,
        scope?.scopeId ?? statement!.scopeId,
        scope?.statementRevision ?? statement?.revision ?? 0,
      );
      toast.success(t('statements:issued', { number: result.data.statement.number }));
      if (result.data.logoOmitted) toast.error(t('statements:logoOmitted'));
      setTarget(undefined);
      await load();
    } catch (failure) {
      const status = failure instanceof ApiClientError ? failure.status : 0;
      toast.error(
        status === 409 && failure instanceof ApiClientError
          ? failure.message
          : failure instanceof ApiClientError
            ? failure.message
            : t('statements:issueFailed'),
      );
      if (status === 409) {
        setTarget(undefined);
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function download(statement: Statement, format: 'pdf' | 'csv') {
    setDownloading(`${statement.id}:${format}`);
    try {
      const result = await downloadStatement(statement.id, format);
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.filename ?? `${statement.number}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) {
      toast.error(
        failure instanceof ApiClientError ? failure.message : t('statements:downloadFailed'),
      );
    } finally {
      setDownloading('');
    }
  }

  if (error && !eligible) {
    return (
      <section className="workspace-records-panel statements-message">
        <p role="alert">{t('statements:loadError')}</p>
        <button className="admin-secondary-action" type="button" onClick={() => void load()}>
          <RefreshCw size={16} aria-hidden /> {t('statements:retry')}
        </button>
      </section>
    );
  }
  if (!eligible || !issued) {
    return (
      <p className="workspace-records-panel statements-message" role="status">
        {t('statements:loading')}
      </p>
    );
  }

  const missing = profile && (!profile.legalName || !profile.taxCode);

  return (
    <div className="statements-view">
      <section className="workspace-records-panel" aria-labelledby="statements-ready">
        <header className="workspace-records-toolbar">
          <div>
            <h2 id="statements-ready">{t('statements:readyTitle')}</h2>
            <p>{t('statements:readyHelp')}</p>
          </div>
        </header>
        {eligible.content.length ? (
          <div
            className="admin-table-wrap"
            tabIndex={0}
            role="region"
            aria-label={t('statements:readyTitle')}
          >
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">{t('statements:scope')}</th>
                  <th scope="col">{t('statements:ended')}</th>
                  <th scope="col">{t('statements:netToDate')}</th>
                  <th scope="col">{t('statements:statement')}</th>
                  <th scope="col">
                    <span className="event-visually-hidden">{t('statements:actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {eligible.content.map((row) => (
                  <tr key={`${row.scopeType}-${row.scopeId}`}>
                    <th scope="row">
                      {row.title}
                      <small>
                        {row.scopeType === 'EVENT'
                          ? t('statements:eventScope', { count: row.performanceCount })
                          : t('statements:performanceScope')}
                      </small>
                    </th>
                    <td>{row.endsAt ? dateTime.format(new Date(row.endsAt)) : '–'}</td>
                    <td>{money.format(row.netSales)}</td>
                    <td>
                      {row.statementNumber ? (
                        <>
                          {row.statementNumber}
                          <small className="statements-badge" data-tone="warning">
                            {t('statements:outOfDate')}
                          </small>
                        </>
                      ) : (
                        t('statements:none')
                      )}
                    </td>
                    <td>
                      <button
                        className="admin-primary-action"
                        type="button"
                        onClick={() => void confirm({ scope: row })}
                        aria-label={t(
                          row.statementNumber ? 'statements:reissueNamed' : 'statements:issueNamed',
                          {
                            title: row.title,
                          },
                        )}
                      >
                        <FilePlus2 size={16} aria-hidden />
                        {t(row.statementNumber ? 'statements:reissue' : 'statements:issue')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="workspace-records-empty">{t('statements:readyEmpty')}</p>
        )}
      </section>

      <section className="workspace-records-panel" aria-labelledby="statements-issued">
        <header className="workspace-records-toolbar">
          <h2 id="statements-issued">{t('statements:issuedTitle')}</h2>
          <p role="status">{t('statements:notPayout')}</p>
        </header>
        {issued.content.length ? (
          <div
            className="admin-table-wrap"
            tabIndex={0}
            role="region"
            aria-label={t('statements:issuedTitle')}
          >
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">{t('statements:number')}</th>
                  <th scope="col">{t('statements:scope')}</th>
                  <th scope="col">{t('statements:issuedAt')}</th>
                  <th scope="col">{t('statements:net')}</th>
                  <th scope="col">{t('statements:state')}</th>
                  <th scope="col">
                    <span className="event-visually-hidden">{t('statements:actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {issued.content.map((statement) => (
                  <tr key={statement.id}>
                    <th scope="row">
                      {statement.number}
                      <small>{t('statements:revision', { revision: statement.revision })}</small>
                    </th>
                    <td>{statement.scope.title}</td>
                    <td>{dateTime.format(new Date(statement.issuedAt))}</td>
                    <td>{money.format(statement.totals.netSales)}</td>
                    <td>
                      {statement.status === 'SUPERSEDED' ? (
                        <small className="statements-badge">
                          {t('statements:supersededBy', { number: statement.supersededByNumber })}
                        </small>
                      ) : statement.outOfDate ? (
                        <small className="statements-badge" data-tone="warning">
                          {t('statements:outOfDateLong')}
                        </small>
                      ) : (
                        <small className="statements-badge" data-tone="ok">
                          {t('statements:upToDate')}
                        </small>
                      )}
                      {statement.totals.unreconciledOrders > 0 && (
                        <small>
                          {t('statements:unreconciled', {
                            count: statement.totals.unreconciledOrders,
                            formatted: integer.format(statement.totals.unreconciledOrders),
                          })}{' '}
                          <Link to={reconciliationLink(statement)}>
                            {t('statements:openReconciliation')}
                          </Link>
                        </small>
                      )}
                    </td>
                    <td>
                      <div className="statements-actions">
                        {statement.status === 'CURRENT' && statement.outOfDate && (
                          <button
                            className="admin-primary-action"
                            type="button"
                            onClick={() => void confirm({ statement })}
                          >
                            <FilePlus2 size={16} aria-hidden /> {t('statements:reissue')}
                          </button>
                        )}
                        {(['pdf', 'csv'] as const).map((format) => (
                          <button
                            key={format}
                            className="admin-secondary-action"
                            type="button"
                            disabled={downloading === `${statement.id}:${format}`}
                            aria-label={t('statements:downloadNamed', {
                              format: format.toUpperCase(),
                              number: statement.number,
                            })}
                            onClick={() => void download(statement, format)}
                          >
                            <Download size={16} aria-hidden /> {format.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="workspace-records-empty">{t('statements:issuedEmpty')}</p>
        )}
        {(page > 0 || issued.hasMore) && (
          <nav className="reconciliation-pagination" aria-label={t('statements:pagination')}>
            <button
              className="admin-secondary-action"
              type="button"
              disabled={page <= 0}
              onClick={() => setPage(page - 1)}
            >
              {t('statements:previousPage')}
            </button>
            <span>{t('statements:pageNumber', { page: page + 1 })}</span>
            <button
              className="admin-secondary-action"
              type="button"
              disabled={!issued.hasMore}
              onClick={() => setPage(page + 1)}
            >
              {t('statements:nextPage')}
            </button>
          </nav>
        )}
      </section>

      {target && (
        <IssueDialog
          profile={profile}
          missing={!!missing}
          busy={busy}
          reissue={'statement' in target || !!target.scope.statementNumber}
          onConfirm={() => void issue()}
          onClose={() => setTarget(undefined)}
        />
      )}
    </div>
  );
}

function IssueDialog({
  profile,
  missing,
  busy,
  reissue,
  onConfirm,
  onClose,
}: {
  profile?: OrganizationProfile;
  missing: boolean;
  busy: boolean;
  reissue: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancel.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);
  return (
    <ModalPortal>
      <div className="admin-dialog-backdrop" role="presentation">
        <section
          className="admin-confirm-dialog statements-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="admin-confirm-content">
            <h2 id={titleId}>
              {t(reissue ? 'statements:reissueTitle' : 'statements:confirmTitle')}
            </h2>
            <p>{t('statements:confirmDescription')}</p>
            <h3>{t('statements:previewTitle')}</h3>
            {!profile ? (
              <p role="status">{t('statements:previewLoading')}</p>
            ) : (
              <dl className="statements-preview">
                <dt>{t('statements:legalName')}</dt>
                <dd>{profile.legalName ?? t('statements:notProvided')}</dd>
                <dt>{t('statements:taxCode')}</dt>
                <dd>{profile.taxCode ?? t('statements:notProvided')}</dd>
                <dt>{t('statements:billingAddress')}</dt>
                <dd>{profile.billingAddress ?? t('statements:notProvided')}</dd>
              </dl>
            )}
            {missing && (
              <p role="alert" className="statements-warning">
                {t('statements:missingDetails')}{' '}
                <Link to="/organizer/settings">{t('statements:openSettings')}</Link>
              </p>
            )}
          </div>
          <footer>
            <button
              ref={cancel}
              className="admin-secondary-action"
              type="button"
              onClick={onClose}
              disabled={busy}
            >
              {t('statements:cancel')}
            </button>
            <button
              className="admin-primary-action"
              type="button"
              onClick={onConfirm}
              disabled={busy}
            >
              {t(reissue ? 'statements:confirmReissue' : 'statements:confirmIssue')}
            </button>
          </footer>
        </section>
      </div>
    </ModalPortal>
  );
}
