import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, CalendarDays, MapPin, RefreshCw, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiClientError } from '../../api/client';
import type { Page } from '../../api/concerts';
import type { DisruptionImpactPage } from '../../api/eventDisruptions';
import {
  completePerformance, findOperatingPerformances, getOperatingPerformance, getPerformanceDisruption,
  getPerformanceDisruptionImpact, resumePerformanceSales, startPerformanceDisruption,
  type OperationsPerformance, type PerformanceDisruption, type PerformanceDisruptionInput,
} from '../../api/performanceOperations';
import { currency, numberFormatter } from '../../data/formatters';
import { formatLanguage } from '../../i18n';
import { formatPerformanceDateTime } from '../organizer/performanceDateTime';
import { PerformanceOperationForm } from './PerformanceOperationForm';
import './PerformanceOperationsPage.css';

const namespace = 'performance-operations';
const number = numberFormatter();
const roots = '/admin/performance-operations';
type Action = PerformanceDisruptionInput | { kind: 'RESUME'; operationId: string } | { kind: 'COMPLETE' };

const operatingDate = (time: string, performance: OperationsPerformance) =>
  formatPerformanceDateTime(time, performance.timezone, formatLanguage());

function indexUrl(query: string, page: number, performance?: string) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (page) params.set('page', String(page + 1));
  if (performance) params.set('performance', performance);
  return roots + (params.size ? '?' + params : '');
}

function availabilityLabel(performance: OperationsPerformance) {
  if (performance.status === 'CANCELLED' || performance.status === 'COMPLETED') return performance.status;
  if (!performance.ticketingAcknowledged) return 'SYNCING';
  if (performance.salesSuspended) return 'PAUSED';
  const now = Date.now();
  if (now < Date.parse(performance.saleStartAt)) return 'SCHEDULED';
  if (now >= Date.parse(performance.saleEndAt)) return 'SALES_CLOSED';
  return performance.status;
}

export function PerformanceOperationsPage() {
  const [params] = useSearchParams();
  const selection = params.get('performance');
  const query = (params.get('q') ?? '').slice(0, 200);
  const page = Math.max(0, Number.parseInt(params.get('page') ?? '1', 10) - 1 || 0);
  return selection
    ? <OperatingPerformance key={selection} id={selection} back={indexUrl(query, page)} />
    : <PerformanceDirectory key={query + ':' + page} query={query} page={page} />;
}

function PerformanceDirectory({ query, page }: { query: string; page: number }) {
  const { t } = useTranslation(namespace);
  const [, setParams] = useSearchParams();
  const [results, setResults] = useState<Page<OperationsPerformance> | null>(null);
  const [failure, setFailure] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void findOperatingPerformances(query, page, controller.signal).then(result => {
      if (!controller.signal.aborted) setResults(result);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setFailure(error instanceof Error ? error.message : t('performance-operations:directoryFailed'));
    });
    return () => controller.abort();
  }, [page, query, t, version]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = String(new FormData(event.currentTarget).get('query') ?? '').trim();
    setParams(term ? { q: term } : {});
  }

  return <div className="performance-ops">
    <header className="performance-ops-title">
      <h1>{t('performances:operations')}</h1>
      <p>{t('performance-operations:directoryDescription')}</p>
    </header>
    <section className="performance-ops-panel" aria-label={t('performance-operations:directory')}>
      <div className="performance-ops-index-toolbar">
        <form className="performance-ops-search" onSubmit={search} role="search">
          <label htmlFor="performance-search">{t('performance-operations:searchLabel')}</label>
          <div>
            <span className="performance-ops-search-field"><Search aria-hidden size={18} />
              <input id="performance-search" type="search" name="query" defaultValue={query}
                placeholder={t('performance-operations:searchPlaceholder')} maxLength={200} />
            </span>
            <button className="button button-primary" type="submit">{t('performance-operations:search')}</button>
          </div>
        </form>
        {results && <p className="performance-ops-muted">{t('performance-operations:results', { count: results.totalElements })}</p>}
      </div>
      {failure && <div className="performance-ops-message" role="alert">{failure}{' '}
        <button type="button" className="button button-secondary" onClick={() => { setFailure(''); setVersion(value => value + 1); }}>
          {t('performances:refresh')}
        </button>
      </div>}
      {!failure && !results && <p className="performance-ops-message" role="status">{t('performance-operations:loading')}</p>}
      {results && !results.content.length && !failure && <div className="performance-ops-empty">
        <CalendarDays size={24} aria-hidden />
        <h2>{t(query ? 'performance-operations:noMatches' : page ? 'performance-operations:noPage' : 'performance-operations:noShows')}</h2>
        <p>{t(query || page ? 'performance-operations:noMatchesHelp' : 'performance-operations:noShowsHelp')}</p>
        {(query || page > 0) && <Link className="button button-secondary" to={roots}>{t('performance-operations:resetSearch')}</Link>}
      </div>}
      {results && !!results.content.length && <table className="performance-ops-table">
        <thead><tr>
          <th scope="col">{t('performance-operations:event')}</th>
          <th scope="col">{t('performances:venueHeading')}</th>
          <th scope="col">{t('performances:startsAt')}</th>
          <th scope="col">{t('performance-operations:saleStatus')}</th>
        </tr></thead>
        <tbody>{results.content.map(show => <tr key={show.id}>
          <th scope="row">
            <Link to={indexUrl(query, page, show.id)} aria-label={t('performance-operations:openShow', {
              title: show.title, venue: show.venueName, time: operatingDate(show.startsAt, show),
            })}>{show.title}<ArrowRight size={15} aria-hidden /></Link>
          </th>
          <td data-column={t('performances:venueHeading')}>{show.venueName}<small>{show.spaceName}</small></td>
          <td data-column={t('performances:startsAt')}><time dateTime={show.startsAt}>{operatingDate(show.startsAt, show)}</time></td>
          <td data-column={t('performance-operations:saleStatus')}><SaleStatus performance={show} /></td>
        </tr>)}</tbody>
      </table>}
      {results && results.totalPages > 1 && <nav className="performance-ops-pagination" aria-label={t('performance-operations:directory')}>
        {page > 0 && <Link className="button button-secondary" to={indexUrl(query, page - 1)}>{t('performances:previous')}</Link>}
        <p>{t('performance-operations:page', { current: page + 1, total: results.totalPages })}</p>
        {!results.last && <Link className="button button-secondary" to={indexUrl(query, page + 1)}>{t('performances:next')}</Link>}
      </nav>}
    </section>
  </div>;
}

function SaleStatus({ performance }: { performance: OperationsPerformance }) {
  const { t } = useTranslation(namespace);
  const status = availabilityLabel(performance);
  return <span className="performance-ops-status" data-status={status}>{t(`sale_${status}`)}</span>;
}

function OperatingPerformance({ id, back }: { id: string; back: string }) {
  const { t } = useTranslation(namespace);
  const [detail, setDetail] = useState<OperationsPerformance>();
  const [status, setStatus] = useState<PerformanceDisruption | null>();
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const [impactReady, setImpactReady] = useState(false);
  const [kind, setKind] = useState<'POSTPONE' | 'CANCEL' | null>(null);
  const [confirming, setConfirming] = useState<Action>();
  const [busy, setBusy] = useState(false);
  const [commandError, setCommandError] = useState('');
  const transaction = useRef<{ body: string; id: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const hasDetail = Boolean(detail);
  const operationPending = status?.state === 'PAUSING' || status?.state === 'RESUMING';
  const pending = operationPending || Boolean(detail && (status === undefined || !detail.ticketingAcknowledged || !detail.checkinAcknowledged));

  useEffect(() => {
    if (hasDetail) heading.current?.focus();
  }, [hasDetail]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    async function load() {
      try {
        const [performance, operation] = await Promise.all([
          getOperatingPerformance(id, controller.signal),
          getPerformanceDisruption(id, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setDetail(performance);
        setStatus(operation);
        setLoadError('');
        if (!performance.ticketingAcknowledged || !performance.checkinAcknowledged
          || operation?.state === 'PAUSING' || operation?.state === 'RESUMING') {
          timer = window.setTimeout(() => void load(), 3200);
        }
      } catch (failure) {
        if (controller.signal.aborted) return;
        setLoadError(failure instanceof ApiClientError && failure.status === 404
          ? t('performance-operations:showUnavailable')
          : failure instanceof Error ? failure.message : t('performance-operations:directoryFailed'));
      }
    }
    void load();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [id, revision, t]);

  async function confirm() {
    if (!confirming || busy) return;
    setBusy(true);
    setCommandError('');
    try {
      if (confirming.kind === 'RESUME') await resumePerformanceSales(id, confirming.operationId);
      else if (confirming.kind === 'COMPLETE') await completePerformance(id);
      else {
        const body = JSON.stringify(confirming);
        if (transaction.current?.body !== body) transaction.current = { body, id: window.crypto.randomUUID() };
        await startPerformanceDisruption(id, confirming, transaction.current.id);
      }
      setConfirming(undefined);
      setKind(null);
      // Invalidate the previous safe-action state until Catalog returns the submitted operation.
      setStatus(undefined);
      setImpactReady(false);
      setRevision(value => value + 1);
      heading.current?.focus();
    } catch (failure) {
      setCommandError(failure instanceof Error ? failure.message : t('performances:saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  function openConfirmation(action: Action) {
    setCommandError('');
    setConfirming(action);
  }

  const operationAllowed = Boolean(detail && ['ON_SALE', 'SOLD_OUT'].includes(detail.status)
    && detail.ticketingAcknowledged && !detail.salesSuspended && status !== undefined
    && (!status || status.state === 'RESUMED') && !loadError);
  const canOperate = operationAllowed && impactReady;
  const canResume = detail && status?.state === 'PAUSED' && Date.now() < Date.parse(detail.saleEndAt) && !loadError;
  const canComplete = canOperate && detail && Date.now() >= Date.parse(detail.endsAt);

  return <div className="performance-ops">
    <nav><Link to={back} className="performance-ops-back"><ArrowLeft size={16} aria-hidden />
      {t('performance-operations:back')}</Link></nav>
    {!detail && <header className="performance-ops-title"><h1>{t('performances:operations')}</h1></header>}
    {loadError && <div className="performance-ops-message" role="alert">{loadError}{' '}
      <button className="button button-secondary" type="button" onClick={() => setRevision(value => value + 1)}>{t('performances:refresh')}</button>
    </div>}
    {!detail && !loadError && <p role="status">{t('performance-operations:loadingShow')}</p>}
    {detail && <>
      <header className="performance-ops-title performance-ops-show-title">
        <div>
          <h1 ref={heading} tabIndex={-1}>{detail.title}</h1>
          <p><MapPin size={16} aria-hidden />{detail.venueName} · {detail.spaceName}</p>
        </div>
        <SaleStatus performance={detail} />
      </header>
      <dl className="performance-ops-panel performance-ops-facts">
        <div><dt>{t('performances:startsAt')}</dt><dd>{operatingDate(detail.startsAt, detail)}</dd></div>
        <div><dt>{t('performances:endsAt')}</dt><dd>{operatingDate(detail.endsAt, detail)}</dd></div>
        <div><dt>{t('performances:timezone')}</dt><dd>{detail.timezone.replace(/_/g, ' ')}</dd></div>
        <div><dt>{t('performance-operations:saleWindow')}</dt>
          <dd>{operatingDate(detail.saleStartAt, detail)} – {operatingDate(detail.saleEndAt, detail)}</dd></div>
      </dl>
      <div className="performance-ops-detail">
        <PerformanceImpact id={id} revision={revision} state={status?.state} onAvailability={setImpactReady} />
        <section className="performance-ops-panel performance-ops-actions" aria-labelledby="performance-actions-title">
          <div className="performance-ops-section-title">
            <h2 id="performance-actions-title">{t('performance-operations:changeManagement')}</h2>
            <button type="button" className="button button-secondary" aria-label={t('performances:refresh')}
              onClick={() => setRevision(value => value + 1)}><RefreshCw size={16} aria-hidden /></button>
          </div>
          {status && <div className="performance-ops-operation">
            <strong>{t(`operation_${status.state}`)}</strong><p>{status.reason}</p>
          </div>}
          {pending && <p role="status" className="performance-ops-muted">{t('performance-operations:syncing')}</p>}
          <dl className="performance-ops-sync">
            <div><dt>{t('performances:ticketing')}</dt><dd>{t(detail.ticketingAcknowledged ? 'performances:synced' : 'performances:notSynced')}</dd></div>
            <div><dt>{t('performances:checkin')}</dt><dd>{t(detail.checkinAcknowledged ? 'performances:synced' : 'performances:notSynced')}</dd></div>
          </dl>
          {canOperate && !kind && <div className="performance-ops-choices">
            <button type="button" className="button button-secondary" onClick={() => setKind('POSTPONE')}>{t('performances:postpone')}</button>
            <button type="button" className="button button-secondary" onClick={() => setKind('CANCEL')}>{t('performances:cancelPerformance')}</button>
            {canComplete && <button type="button" className="button button-secondary"
              onClick={() => openConfirmation({ kind: 'COMPLETE' })}>{t('performances:complete')}</button>}
          </div>}
          {kind && canOperate && <PerformanceOperationForm key={kind} performance={detail} kind={kind}
            onCancel={() => setKind(null)} onReview={openConfirmation} />}
          {canResume && status && <button type="button" className="button button-primary"
            onClick={() => openConfirmation({ kind: 'RESUME', operationId: status.id })}>{t('performances:resume')}</button>}
          {!canOperate && !canResume && !pending && <p className="performance-ops-muted">
            {t(operationAllowed ? 'performance-operations:waitForImpact' : 'performance-operations:noActions')}
          </p>}
        </section>
      </div>
      {confirming && <OperationConfirmation action={confirming} performance={detail} busy={busy} error={commandError}
        onDismiss={() => setConfirming(undefined)} onConfirm={() => void confirm()} />}
    </>}
  </div>;
}

function PerformanceImpact({ id, revision, state, onAvailability }: {
  id: string; revision: number; state?: PerformanceDisruption['state']; onAvailability: (ready: boolean) => void;
}) {
  const { t } = useTranslation(namespace);
  const [page, setPage] = useState(0);
  const [next, setNext] = useState(0);
  const [impact, setImpact] = useState<DisruptionImpactPage>();
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void getPerformanceDisruptionImpact(id, page, controller.signal).then(result => {
      if (!controller.signal.aborted) {
        setImpact(result);
        onAvailability(true);
        setError('');
        if (page > 0 && page >= result.totalPages) setPage(0);
      }
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) {
        onAvailability(false);
        setError(failure instanceof Error ? failure.message : t('performance-operations:impactFailed'));
      }
    });
    return () => controller.abort();
  }, [id, next, onAvailability, page, revision, state, t]);

  const current = impact?.page === page ? impact : undefined;
  return <section className="performance-ops-panel performance-ops-impact" aria-labelledby="performance-impact-title">
    <div className="performance-ops-section-title">
      <h2 id="performance-impact-title">{t('performances:orderImpact')}</h2>
      {current && <span className="performance-ops-status">{number.format(current.totalElements)}</span>}
    </div>
    <p className="performance-ops-muted">{t('performance-operations:impactHelp')}</p>
    {error && <div role="alert">{error}{' '}
      <button className="button button-secondary" type="button" onClick={() => setNext(value => value + 1)}>{t('performances:refresh')}</button>
    </div>}
    {!error && !current && <p role="status">{t('performance-operations:loadingImpact')}</p>}
    {!error && current && !current.content.length && <p>{t('performance-operations:noOrders')}</p>}
    {!error && current && !!current.content.length && <table className="performance-ops-table">
      <thead><tr>
        <th scope="col">{t('performance-operations:order')}</th>
        <th scope="col">{t('performance-operations:payment')}</th>
        <th scope="col">{t('performance-operations:amount')}</th>
      </tr></thead>
      <tbody>{current.content.map(order => <tr key={order.orderId}>
        <th scope="row">
          <Link to={'/admin/orders?' + new URLSearchParams({ orderId: order.orderId })}>
            {order.referenceCode ?? t('admin:adminOrdersPage_openOrder')}
          </Link>
          <small>{t(`order_${order.status}`, { defaultValue: t('performance-operations:unknown') })}</small>
        </th>
        <td data-column={t('performance-operations:payment')}>
          {t(`payment_${order.paymentState}`, { defaultValue: t('performance-operations:unknown') })}
          {order.casePrepared && <small>{t('performance-operations:casePrepared')}</small>}
        </td>
        <td data-column={t('performance-operations:amount')}>{currency.format(order.amount)}</td>
      </tr>)}</tbody>
    </table>}
    {!error && current && current.totalPages > 1 && <nav className="performance-ops-pagination" aria-label={t('performances:orderImpact')}>
      <button type="button" className="button button-secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>{t('performances:previous')}</button>
      <p>{t('performance-operations:page', { current: page + 1, total: current.totalPages })}</p>
      <button type="button" className="button button-secondary" disabled={page + 1 === current.totalPages} onClick={() => setPage(page + 1)}>{t('performances:next')}</button>
    </nav>}
  </section>;
}

function OperationConfirmation({ action, performance, busy, error, onConfirm, onDismiss }: {
  action: Action; performance: OperationsPerformance; busy: boolean; error: string;
  onConfirm: () => void; onDismiss: () => void;
}) {
  const { t } = useTranslation(namespace);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    node?.showModal();
    return () => {
      node?.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const operation = t(`action_${action.kind}`);
  return <dialog className="performance-ops-dialog" ref={dialog} aria-labelledby="operation-confirm-title" onCancel={event => {
    event.preventDefault();
    if (!busy) onDismiss();
  }}>
    <h2 id="operation-confirm-title">{operation}</h2>
    <p><strong>{performance.title}</strong><br />{operatingDate(performance.startsAt, performance)} · {performance.venueName}</p>
    {action.kind === 'POSTPONE' && <p>{t('performance-operations:newStart', { time: operatingDate(action.startsAt, performance) })}</p>}
    <p>{t(`consequence_${action.kind}`)}</p>
    {error && <p role="alert" className="performance-ops-error">{error}</p>}
    <div className="performance-ops-dialog-actions">
      <button type="button" className="button button-secondary" autoFocus disabled={busy} onClick={onDismiss}>
        {t('performance-operations:backToReview')}
      </button>
      <button type="button" className="button button-primary" data-danger={action.kind === 'CANCEL'} disabled={busy} onClick={onConfirm}>
        {busy ? t('performance-operations:sending') : operation}
      </button>
    </div>
  </dialog>;
}
