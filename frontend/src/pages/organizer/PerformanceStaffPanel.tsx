import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  assignPerformanceStaff, listPerformanceStaff, revokePerformanceStaff, type PerformanceStaff,
} from '../../api/performanceManagement';

export function PerformanceStaffPanel({ id }: { id: string }) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<PerformanceStaff[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    listPerformanceStaff(id, controller.signal).then((rows) => {
      if (!controller.signal.aborted) setEntries(rows);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, [id]);

  async function apply(staffId: string, grant: boolean) {
    setBusy(true);
    setError('');
    try {
      if (grant) await assignPerformanceStaff(id, staffId);
      else await revokePerformanceStaff(id, staffId);
      setEntries(await listPerformanceStaff(id));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('performances:saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const account = String(new FormData(event.currentTarget).get('account') ?? '').trim();
    if (account) void apply(account, true);
  }

  return <section className="performance-panel">
    <h2>{t('performances:staff')}</h2>
    {error && <p role="alert">{error}</p>}
    {!entries && !error && <p role="status">{t('performances:loading')}</p>}
    {entries && <ul className="performance-list">{entries.map((entry) => (
      <li className="performance-show" key={entry.staffId}>
        <span>{entry.staffId}</span>
        <button type="button" className="button button-secondary" disabled={busy} onClick={() => void apply(entry.staffId, false)}>{t('performances:revokeStaff')}</button>
      </li>
    ))}</ul>}
    <form className="performance-form" onSubmit={submit}>
      <label>{t('performances:staffAccount')}<input name="account" required
        pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" /></label>
      <button className="button button-primary" disabled={busy}>{t('performances:assignStaff')}</button>
    </form>
  </section>;
}
