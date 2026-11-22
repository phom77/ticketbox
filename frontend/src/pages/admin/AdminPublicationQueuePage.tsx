import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getPublicationQueue, type PublicationReview } from '../../api/publication';
import { decidePerformanceReview, getPerformanceReviewQueue, type PerformanceReview } from '../../api/performanceManagement';
import type { ReviewDecision } from '../../api/publication';
import { WorkspaceSelect } from '../../components/WorkspaceSelect';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { dateFormatter, numberFormatter } from '../../data/formatters';

const formatDate = dateFormatter({ dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });

const money = numberFormatter({ style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

export function AdminPublicationQueuePage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<PublicationReview[]>([]);
  const [performances, setPerformances] = useState<PerformanceReview[]>([]);
  const [query, setQuery] = useState('');
  const [state, setState] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([getPublicationQueue(controller.signal), getPerformanceReviewQueue(controller.signal)]).then(([next, native]) => {
      if (!controller.signal.aborted) {
        setRows(next);
        setPerformances(native);
      }
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : t('shared:publicationPanel_khongTheTaiTrangThaiMoBan'));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [revision, t]);

  const matches = (title: string, reviewState: string) => (!state || state === reviewState)
    && title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const shown = rows.filter((row) => matches(row.title, row.state));
  const shows = performances.filter((row) => matches(row.summary.title, row.state));

  return <>
    <AdminPageHeader title={t('shared:releaseQueue')} actions={<button type="button" className="admin-secondary-action"
      disabled={loading} onClick={() => { setLoading(true); setError(''); setRevision((value) => value + 1); }}>
      {t('shared:publicationPanel_kiemTraLai')}
    </button>} />
    <div className="admin-toolbar">
      <label className="admin-field">{t('shared:releaseEvent')}<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <label className="admin-field">{t('shared:releaseState')}
        <WorkspaceSelect label={t('shared:releaseState')} value={state} onChange={setState}
          options={[{ value: '', label: t('shared:releaseAllStates') },
            ...['SUBMITTED', 'SCHEDULED', 'HELD', 'MISSED'].map((value) => ({ value, label: t(`shared:release_${value}`) }))]} />
      </label>
    </div>
    {error ? <p role="alert">{error}</p> : null}
    {loading ? <p role="status">{t('shared:publicationPanel_dangKiemTraDieuKienMoBan')}</p> : null}
    {!error && !loading && !shown.length && !shows.length ? <p role="status">{t('shared:releaseQueueEmpty')}</p> : null}
    {shown.length ? <div className="admin-table-wrap">
      <table className="admin-table">
        <thead><tr><th>{t('shared:releaseEvent')}</th><th>{t('shared:releaseState')}</th>
          <th>{t('shared:releasePublishAt')} (ICT)</th><th>{t('shared:releaseSaleAt')} (ICT)</th></tr></thead>
        <tbody>{shown.map((row) => {
          const delayed = row.state === 'SCHEDULED' && Date.parse(row.publishAt) <= Date.now();
          return <tr key={row.id}>
            <td><Link className="admin-table-primary" to={`/admin/concerts/${row.concertId}`}>{row.title}</Link></td>
            <td>{t(`shared:release_${delayed ? 'PENDING' : row.state}`)}</td>
            <td>{formatDate.format(new Date(row.publishAt))}</td>
            <td>{formatDate.format(new Date(row.saleStartAt))}</td>
          </tr>;
        })}</tbody>
      </table>
    </div> : null}
    {shows.length > 0 && <section className="organization-panel" aria-labelledby="performance-review-list">
      <h2 id="performance-review-list">{t('performances:manageConcerts')}</h2>
      <ul className="organization-list">
        {shows.map((row) => <li key={row.id}>
          <PerformanceReviewItem row={row} onChange={(updated) =>
            setPerformances((current) => current.map((item) => item.id === updated.id ? updated : item))} />
        </li>)}
      </ul>
    </section>}
  </>;
}

function PerformanceReviewItem({ row, onChange }: { row: PerformanceReview; onChange: (row: PerformanceReview) => void }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const summary = row.summary;

  async function decide(action: ReviewDecision | 'HOLD') {
    setBusy(true);
    setError('');
    try {
      onChange(await decidePerformanceReview(row.performanceId, row.id, action, reason));
      setReason('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('requestFailed'));
    } finally {
      setBusy(false);
    }
  }

  return <details>
    <summary><strong>{summary.title}</strong> · {formatDate.format(new Date(summary.startsAt))} · {t(`shared:release_${row.state}`)}</summary>
    <p>{summary.venueName} · {summary.spaceName} · {t(summary.publicVisible ? 'performances:reviewPublic' : 'performances:reviewPrivate')}</p>
    {summary.description && <p>{summary.description}</p>}
    <dl className="publication-status">
      <div><dt>{t('shared:releasePublishAt')} (ICT)</dt><dd>{formatDate.format(new Date(row.publishAt))}</dd></div>
      <div><dt>{t('shared:releaseSaleAt')} (ICT)</dt><dd>{formatDate.format(new Date(summary.saleStartAt))}</dd></div>
    </dl>
    <ul>{summary.offers.filter((offer) => offer.active).map((offer, index) =>
      <li key={index}>{offer.name} · {money.format(offer.price)} · {formatDate.format(new Date(offer.saleStartAt))} → {formatDate.format(new Date(offer.saleEndAt))}</li>)}</ul>
    {row.reason && <p>{row.reason}</p>}
    {error && <p role="alert">{error}</p>}
    {(row.state === 'SUBMITTED' || row.state === 'SCHEDULED') && <div className="organization-form">
      <label className="admin-field">{t('shared:releaseReason')}
        <textarea value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} />
      </label>
      {row.state === 'SUBMITTED' ? <>
        <button type="button" className="admin-primary-action" disabled={busy} onClick={() => void decide('APPROVE')}>{t('shared:releaseApprove')}</button>
        <button type="button" className="admin-secondary-action" disabled={busy || !reason.trim()} onClick={() => void decide('REQUEST_CHANGES')}>{t('shared:releaseRequestChanges')}</button>
        <button type="button" className="admin-secondary-action" disabled={busy || !reason.trim()} onClick={() => void decide('REJECT')}>{t('shared:releaseReject')}</button>
      </> : <button type="button" className="admin-secondary-action" disabled={busy || !reason.trim()}
        onClick={() => void decide('HOLD')}>{t('shared:releaseHold')}</button>}
    </div>}
  </details>;
}
