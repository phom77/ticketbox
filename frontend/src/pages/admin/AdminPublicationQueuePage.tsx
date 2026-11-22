import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getPublicationQueue, type PublicationReview } from '../../api/publication';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { dateFormatter } from '../../data/formatters';

const formatDate = dateFormatter({ dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });

export function AdminPublicationQueuePage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<PublicationReview[]>([]);
  const [query, setQuery] = useState('');
  const [state, setState] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void getPublicationQueue(controller.signal).then((next) => {
      if (!controller.signal.aborted) setRows(next);
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : t('shared:publicationPanel_khongTheTaiTrangThaiMoBan'));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [revision, t]);

  const shown = rows.filter((row) => (!state || state === row.state)
    && row.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  return <>
    <AdminPageHeader title={t('shared:releaseQueue')} actions={<button type="button" className="admin-secondary-action"
      disabled={loading} onClick={() => { setLoading(true); setError(''); setRevision((value) => value + 1); }}>
      {t('shared:publicationPanel_kiemTraLai')}
    </button>} />
    <div className="admin-toolbar">
      <label className="admin-field">{t('shared:releaseEvent')}<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <label className="admin-field">{t('shared:releaseState')}<select value={state} onChange={(event) => setState(event.target.value)}>
        <option value="">{t('shared:releaseAllStates')}</option>
        {['SUBMITTED', 'SCHEDULED', 'HELD', 'MISSED'].map((value) => <option key={value} value={value}>{t(`shared:release_${value}`)}</option>)}
      </select></label>
    </div>
    {error ? <p role="alert">{error}</p> : null}
    {loading ? <p role="status">{t('shared:publicationPanel_dangKiemTraDieuKienMoBan')}</p> : null}
    {!error && !loading && !shown.length ? <p role="status">{t('shared:releaseQueueEmpty')}</p> : null}
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
  </>;
}
