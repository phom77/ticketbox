import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, apiGet } from '../../api/client';
import { currency } from '../../data/formatters';
import '../organizer/PerformanceWorkspace.css';

type Disruption = { id: string; kind: string; state: string; reason: string };
type Impact = { orderId: string; status: string; paymentState: string; amount: number; casePrepared: boolean };
const operationsPath = (id: string) => '/api/admin/v2/performances/' + encodeURIComponent(id) + '/disruption';

export function PerformanceOperationsPage() {
  const { t } = useTranslation();
  const [id, setId] = useState('');
  return (
    <div className="performance-admin">
      <h1>{t('performances:operations')}</h1>
      <form className="performance-form performance-panel" onSubmit={(event) => {
        event.preventDefault();
        setId(String(new FormData(event.currentTarget).get('performance')).trim());
      }}>
        <label>{t('performances:performanceId')}<input name="performance" required
          pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" /></label>
        <button className="button button-primary">{t('performances:lookup')}</button>
      </form>
      {id && <PerformanceOperations key={id} id={id} />}
    </div>
  );
}

function PerformanceOperations({ id }: { id: string }) {
  const { t } = useTranslation();
  const path = operationsPath(id);
  const [status, setStatus] = useState<Disruption | null>(null);
  const [rows, setRows] = useState<Impact[] | null>(null);
  const [page, setPage] = useState(0);
  const [lastPage, setLastPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [kind, setKind] = useState('POSTPONE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const operation = useRef<{ body: string; id: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    void Promise.all([
      apiGet<Disruption | null>(path, signal),
      apiGet<{ content: Impact[]; totalPages: number }>(path + '/impact?page=' + page, signal),
    ]).then(([action, result]) => {
      if (signal.aborted) return;
      setStatus(action);
      setRows(result.content);
      setLastPage(result.totalPages - 1);
    }).catch((failure) => {
      if (!signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, [path, page, revision]);

  async function send(suffix: string, input?: unknown) {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api.post(path + suffix, input);
      setRevision((value) => value + 1);
      setMessage(t('performances:operationsSubmitted'));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('performances:saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.confirm(t('performances:confirmDisruption'))) return;
    const data = new FormData(event.currentTarget);
    const reason = String(data.get('reason')).trim();
    const input = kind === 'CANCEL' ? { kind, reason } : {
      kind, reason, startsAt: data.get('startsAt'), endsAt: data.get('endsAt'),
      doorsOpenAt: data.get('doorsOpenAt') || null, saleStartAt: data.get('saleStartAt'), saleEndAt: data.get('saleEndAt'),
    };
    const body = JSON.stringify(input);
    if (operation.current?.body !== body) operation.current = { body, id: window.crypto.randomUUID() };
    void send('', { ...input, actionId: operation.current.id });
  }

  return <>
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {rows && <section className="performance-panel">
      <div className="performance-actions">
        <h2>{t('performances:orderImpact')}</h2>
        <button type="button" className="button button-secondary" onClick={() => setRevision((value) => value + 1)}>{t('performances:refresh')}</button>
      </div>
      {status && <p>{status.state} · {status.reason}</p>}
      <ul className="performance-list">
        {rows.map((item) => <li className="performance-show" key={item.orderId}>
          <span>{item.orderId}</span>
          <span>{item.status} · {item.paymentState} · {currency.format(item.amount)}</span>
        </li>)}
      </ul>
      {(page > 0 || lastPage > 0) && <div className="performance-options">
        <button type="button" className="button button-secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>{t('performances:previous')}</button>
        <button type="button" className="button button-secondary" disabled={page >= lastPage} onClick={() => setPage(page + 1)}>{t('performances:next')}</button>
      </div>}
      {(!status || status.state === 'RESUMED') && <form className="performance-form" onSubmit={submit}>
        <label>{t('performances:action')}<select value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="POSTPONE">{t('performances:postpone')}</option>
          <option value="CANCEL">{t('performances:cancelPerformance')}</option>
        </select></label>
        <label>{t('performances:reason')}<input name="reason" maxLength={1000} required /></label>
        {kind === 'POSTPONE' && <>
          <label>{t('performances:startsAt')}<input name="startsAt" required /></label>
          <label>{t('performances:endsAt')}<input name="endsAt" required /></label>
          <label>{t('performances:doorsOpenAt')}<input name="doorsOpenAt" /></label>
          <label>{t('performances:saleStartAt')}<input name="saleStartAt" required /></label>
          <label>{t('performances:saleEndAt')}<input name="saleEndAt" required /></label>
          <p className="performance-wide">{t('performances:timeFormat')}</p>
        </>}
        <button className="button button-primary" disabled={busy}>{t('performances:applyAction')}</button>
      </form>}
      {status?.state === 'PAUSED' && <button type="button" className="button button-primary" disabled={busy}
        onClick={() => void send('/' + status.id + '/resume')}>{t('performances:resume')}</button>}
      {(!status || status.state === 'RESUMED') && <button type="button" className="button button-secondary" disabled={busy}
        onClick={() => void send('/complete')}>{t('performances:complete')}</button>}
    </section>}
  </>;
}
