import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Download, FilePlus2, RefreshCw } from 'lucide-react';
import { ApiClientError } from '../../api/client';
import { getSalesEvents, type SalesEventOption } from '../../api/sales';
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
import { ConcertPicker, type ConcertPickerItem } from '../../components/admin/ConcertPicker';
import { ModalPortal } from '../../components/feedback/ModalPortal';
import { useToast } from '../../components/feedback/toast-context';
import { dateFormatter } from '../../data/formatters';
import { useOrganization } from '../organizations/OrganizationProvider';
import { integer, money } from './salesFormat';
import './StatementsView.css';

const dateTime = dateFormatter({ dateStyle: 'medium', timeStyle: 'short' });

type Target = { scope: EligibleScope } | { statement: Statement };

const day = 86400000;

/** Reconciliation filtered to the statement's performance or event, over a period that covers its sales. */
function reconciliationLink(statement: Statement) {
  const params = new URLSearchParams({ view: 'reconciliation' });
  params.set(statement.scopeType === 'PERFORMANCE' ? 'concertId' : 'eventId', statement.scopeId);
  const issuedAt = new Date(statement.issuedAt).getTime();
  params.set('from', new Date(issuedAt - 365 * day).toISOString().slice(0, 10));
  params.set('to', new Date(issuedAt + day).toISOString().slice(0, 10));
  return `/organizer/reports?${params}`;
}

type ProfileState =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; profile: OrganizationProfile };

function Pager({
  page,
  hasMore,
  label,
  onPage,
}: {
  page: number;
  hasMore: boolean;
  label: string;
  onPage: (page: number) => void;
}) {
  const { t } = useTranslation();
  if (page <= 0 && !hasMore) return null;
  return (
    <nav className="reconciliation-pagination" aria-label={label}>
      <button
        className="admin-secondary-action"
        type="button"
        disabled={page <= 0}
        onClick={() => onPage(page - 1)}
      >
        {t('statements:previousPage')}
      </button>
      <span>{t('statements:pageNumber', { page: page + 1 })}</span>
      <button
        className="admin-secondary-action"
        type="button"
        disabled={!hasMore}
        onClick={() => onPage(page + 1)}
      >
        {t('statements:nextPage')}
      </button>
    </nav>
  );
}

/** Reports > Statements: scopes that are ready for a statement, and the statements already issued. */
export function StatementsView() {
  const { t } = useTranslation();
  const toast = useToast();
  const organization = useOrganization();
  const organizationId = organization?.selected?.id;
  const [eligible, setEligible] = useState<StatementPage<EligibleScope>>();
  const [issued, setIssued] = useState<StatementPage<Statement>>();
  const [readyPage, setReadyPage] = useState(0);
  const [issuedPage, setIssuedPage] = useState(0);
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [eventId, setEventId] = useState('');
  const [eventSearch, setEventSearch] = useState('');
  const [events, setEvents] = useState<SalesEventOption[]>([]);
  const [chosenEvent, setChosenEvent] = useState<ConcertPickerItem>();
  const [error, setError] = useState(false);
  const [target, setTarget] = useState<Target>();
  const [profile, setProfile] = useState<ProfileState>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState('');
  const [attempt, setAttempt] = useState(0);

  // Search text applies after a short pause and returns to the first page.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch((current) => {
        if (current !== searchText.trim()) setReadyPage(0);
        return searchText.trim();
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    const controller = new AbortController();
    getEligibleStatements(search || undefined, readyPage, controller.signal)
      .then((ready) => {
        setEligible(ready);
        setError(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [search, readyPage, organizationId, attempt]);

  useEffect(() => {
    const controller = new AbortController();
    getStatements(eventId || undefined, issuedPage, controller.signal)
      .then((done) => {
        setIssued(done);
        setError(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [eventId, issuedPage, organizationId, attempt]);

  // Event choices for the issued list follow the search text.
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      getSalesEvents(eventSearch.trim() || undefined, 20, controller.signal)
        .then((result) => setEvents(result.content))
        .catch(() => undefined);
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [eventSearch, organizationId]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  const loadProfile = useCallback(async () => {
    setProfile({ status: 'loading' });
    if (!organizationId) {
      setProfile({ status: 'failed' });
      return;
    }
    try {
      setProfile({ status: 'ready', profile: await getOrganizationProfile(organizationId) });
    } catch (failure) {
      void failure;
      setProfile({ status: 'failed' });
    }
  }, [organizationId]);

  function confirm(next: Target) {
    setTarget(next);
    void loadProfile();
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
      reload();
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
        reload();
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
        <button className="admin-secondary-action" type="button" onClick={reload}>
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

  const missing =
    profile.status === 'ready' && (!profile.profile.legalName || !profile.profile.taxCode);
  const eventItems: ConcertPickerItem[] = events.map((event) => ({
    id: event.eventId,
    title: event.title,
  }));

  return (
    <div className="statements-view">
      <section className="workspace-records-panel" aria-labelledby="statements-ready">
        <header className="workspace-records-toolbar">
          <div>
            <h2 id="statements-ready">{t('statements:readyTitle')}</h2>
            <p>{t('statements:readyHelp')}</p>
          </div>
          <label className="workspace-records-field">
            <span>{t('statements:search')}</span>
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder={t('statements:searchPlaceholder')}
            />
          </label>
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
                          {row.outOfDate && (
                            <small className="statements-badge" data-tone="warning">
                              {t('statements:outOfDate')}
                            </small>
                          )}
                          {row.detailsChanged && (
                            <small className="statements-badge" data-tone="warning">
                              {t('statements:detailsChanged')}
                            </small>
                          )}
                        </>
                      ) : (
                        t('statements:none')
                      )}
                    </td>
                    <td>
                      <button
                        className="admin-primary-action"
                        type="button"
                        onClick={() => confirm({ scope: row })}
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
          <p className="workspace-records-empty">
            {t(search ? 'statements:readyNoMatch' : 'statements:readyEmpty')}
          </p>
        )}
        <Pager
          page={readyPage}
          hasMore={eligible.hasMore}
          label={t('statements:readyPagination')}
          onPage={setReadyPage}
        />
      </section>

      <section className="workspace-records-panel" aria-labelledby="statements-issued">
        <header className="workspace-records-toolbar">
          <h2 id="statements-issued">{t('statements:issuedTitle')}</h2>
          <p role="status">{t('statements:notPayout')}</p>
          <ConcertPicker
            concerts={eventItems}
            value={eventId}
            selection={chosenEvent}
            onChange={(id) => {
              setEventId(id);
              setChosenEvent(
                events.find((event) => event.eventId === id)
                  ? { id, title: events.find((event) => event.eventId === id)!.title }
                  : undefined,
              );
              setIssuedPage(0);
            }}
            label={t('statements:eventFilter')}
            placeholder={t('statements:allEvents')}
            allowAll
            allLabel={t('statements:allEvents')}
            onSearch={setEventSearch}
            searchLabel={t('statements:searchEvents')}
          />
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
                      ) : statement.outOfDate || statement.detailsChanged ? (
                        <>
                          {statement.outOfDate && (
                            <small className="statements-badge" data-tone="warning">
                              {t('statements:outOfDateLong')}
                            </small>
                          )}
                          {statement.detailsChanged && (
                            <small className="statements-badge" data-tone="warning">
                              {t('statements:detailsChangedLong')}
                            </small>
                          )}
                        </>
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
                        {statement.status === 'CURRENT' &&
                          (statement.outOfDate || statement.detailsChanged) && (
                            <button
                              className="admin-primary-action"
                              type="button"
                              onClick={() => confirm({ statement })}
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
        <Pager
          page={issuedPage}
          hasMore={issued.hasMore}
          label={t('statements:pagination')}
          onPage={setIssuedPage}
        />
      </section>

      {target && (
        <IssueDialog
          profile={profile}
          missing={!!missing}
          busy={busy}
          reissue={'statement' in target || !!target.scope.statementNumber}
          onConfirm={() => void issue()}
          onRetry={() => void loadProfile()}
          onClose={() => setTarget(undefined)}
        />
      )}
    </div>
  );
}

const focusable =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function IssueDialog({
  profile,
  missing,
  busy,
  reissue,
  onConfirm,
  onRetry,
  onClose,
}: {
  profile: ProfileState;
  missing: boolean;
  busy: boolean;
  reissue: boolean;
  onConfirm: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const dialog = useRef<HTMLElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancel.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  /** Keeps Tab and Shift+Tab inside the dialog while it is open. */
  function trap(event: ReactKeyboardEvent) {
    if (event.key !== 'Tab' || !dialog.current) return;
    const items = Array.from(dialog.current.querySelectorAll<HTMLElement>(focusable));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialog.current.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.current.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <ModalPortal>
      <div className="admin-dialog-backdrop" role="presentation">
        <section
          ref={dialog}
          className="admin-confirm-dialog statements-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onKeyDown={trap}
        >
          <div className="admin-confirm-content">
            <h2 id={titleId}>
              {t(reissue ? 'statements:reissueTitle' : 'statements:confirmTitle')}
            </h2>
            <p>{t('statements:confirmDescription')}</p>
            <h3>{t('statements:previewTitle')}</h3>
            {profile.status === 'loading' && <p role="status">{t('statements:previewLoading')}</p>}
            {profile.status === 'failed' && (
              <div role="alert" className="statements-warning">
                <p>{t('statements:previewFailed')}</p>
                <button className="admin-secondary-action" type="button" onClick={onRetry}>
                  <RefreshCw size={16} aria-hidden /> {t('statements:retry')}
                </button>
              </div>
            )}
            {profile.status === 'ready' && (
              <dl className="statements-preview">
                <dt>{t('statements:legalName')}</dt>
                <dd>{profile.profile.legalName ?? t('statements:notProvided')}</dd>
                <dt>{t('statements:taxCode')}</dt>
                <dd>{profile.profile.taxCode ?? t('statements:notProvided')}</dd>
                <dt>{t('statements:billingAddress')}</dt>
                <dd>{profile.profile.billingAddress ?? t('statements:notProvided')}</dd>
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
              disabled={busy || profile.status !== 'ready'}
            >
              {t(reissue ? 'statements:confirmReissue' : 'statements:confirmIssue')}
            </button>
          </footer>
        </section>
      </div>
    </ModalPortal>
  );
}
