import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useEffect, useState, type FormEvent } from 'react';
import { getAdminConcerts, type ManagementApiScope } from '../../api/admin';
import { getApprovedOrganizations, type ApprovedOrganization } from '../../api/organizations';
import { downloadReconciliation, getReconciliation,
  type ReconciliationFilters, type ReconciliationReport } from '../../api/reconciliation';
import { Download } from 'lucide-react';
import { ConcertPicker, type ConcertPickerItem } from '../../components/admin/ConcertPicker';
import { WorkspaceSelect } from '../../components/WorkspaceSelect';
import './WorkspaceRecords.css';
import { currency, dateFormatter } from '../../data/formatters';

const dateTime = dateFormatter({
  dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh',
});
const dateInput = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
const paymentStatus: Record<string, string> = {
  get PENDING_REPORT() { return translate("organizer:reconciliationPage_choDongBo"); }, get CREATED() { return translate("organizer:reconciliationPage_daTao"); }, get PROCESSING() { return translate("organizer:reconciliationPage_dangXuLy"); },
  get READY() { return translate("organizer:reconciliationPage_choNguoiMua"); }, get UNKNOWN() { return translate("organizer:reconciliationPage_chuaXacDinh"); }, get FAILED() { return translate("organizer:reconciliationPage_thatBai"); },
  get SETTLEMENT_PENDING() { return translate("organizer:reconciliationPage_daXacNhanThuChoXuLy"); }, get SUCCEEDED() { return translate('processed'); },
  get RECONCILIATION_REQUIRED() { return translate("organizer:reconciliationPage_tienDenMuonCanDoiSoat"); }, get REVIEW_REQUIRED() { return translate("organizer:reconciliationPage_canKiemTra"); },
};
const orderStatus: Record<string, string> = {
  get AWAITING_PAYMENT() { return translate("organizer:reconciliationPage_choThanhToan"); }, get PAID() { return translate("organizer:reconciliationPage_daThanhToan"); }, get EXPIRED() { return translate("organizer:reconciliationPage_hetHan"); }, get CANCELLED() { return translate("organizer:reconciliationPage_daHuy"); },
};

function initialFilters(): ReconciliationFilters {
  const now = new Date();
  return {
    from: dateInput.format(new Date(now.getTime() - 30 * 86400000)),
    to: dateInput.format(new Date(now.getTime() + 86400000)),
    basis: 'ATTEMPT', organizationId: '', concertId: '', unattributed: false,
  };
}

function date(value: string | null) {
  return value ? dateTime.format(new Date(value)) : '—';
}

export function ReconciliationPage({ scope }: { scope: ManagementApiScope }) {
  useTranslation();
  const [draft, setDraft] = useState(initialFilters);
  const [filter, setFilter] = useState(initialFilters);
  const [page, setPage] = useState(0);
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [organizations, setOrganizations] = useState<ApprovedOrganization[]>([]);
  const [concerts, setConcerts] = useState<ConcertPickerItem[]>([]);
  const [selectedConcert, setSelectedConcert] = useState<ConcertPickerItem>();
  const [concertQuery, setConcertQuery] = useState('');
  const [concertsLoading, setConcertsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void getAdminConcerts(0, 200, undefined, controller.signal, scope, concertQuery).then((value) => {
        if (!controller.signal.aborted) setConcerts(value.content);
      }).catch(() => {
        if (!controller.signal.aborted) {
          setConcerts([]);
          setOptionsError(translate("organizer:reconciliationPage_khongTaiDuocDanhSachBuoiDien"));
        }
      }).finally(() => {
        if (!controller.signal.aborted) setConcertsLoading(false);
      });
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [scope, concertQuery]);

  useEffect(() => {
    const controller = new AbortController();
    if (scope === 'admin') {
      void getApprovedOrganizations(controller.signal).then((value) => {
        if (!controller.signal.aborted) setOrganizations(value);
      }).catch(() => {
        if (!controller.signal.aborted) setOptionsError(translate("organizer:reconciliationPage_khongTaiDuocDanhSachToChuc"));
      });
    }
    return () => controller.abort();
  }, [scope]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setReport(null);
    void getReconciliation(scope, filter, page, controller.signal).then((value) => {
      if (!controller.signal.aborted) setReport(value);
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : translate("organizer:reconciliationPage_khongTaiDuocBaoCao"));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [scope, filter, page]);

  function apply(event: FormEvent) {
    event.preventDefault();
    setPage(0);
    setFilter({ ...draft });
  }

  async function exportCsv() {
    setExporting(true);
    setExportError('');
    try {
      const blob = await downloadReconciliation(scope, filter);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'doi-soat-thanh-toan.csv';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setExportError(translate("organizer:reconciliationPage_khongTheTaiCsvVuiLongThu"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="workspace-records">
      <header className="workspace-records-header">
        <div>
          <h1>{translate('organizer:reconciliationPage_doiSoatThanhToan')}</h1>
          <p>{translate('organizer:reconciliationPage_traCuuKhoanThuDaXacMinh')}</p>
        </div>
        <button className="admin-secondary-action" type="button" disabled={!report || exporting} onClick={() => void exportCsv()}>
          <Download size={18} aria-hidden />
          {exporting ? translate('organizer:reconciliationPage_dangXuat') : translate('organizer:reconciliationPage_taiCsv')}
        </button>
      </header>
      <section className="workspace-records-panel reconciliation-panel">
        <form className="reconciliation-filters" data-scope={scope} onSubmit={apply}>
          <label className="workspace-records-field">{translate('organizer:reconciliationPage_tuNgay')}
            <input type="date" required value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} />
          </label>
          <label className="workspace-records-field">{translate('organizer:reconciliationPage_denTruocNgay')}
            <input type="date" required value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} />
          </label>
          <label className="workspace-records-field">{translate('organizer:reconciliationPage_kyTheo')}
            <WorkspaceSelect value={draft.basis} label={translate('organizer:reconciliationPage_kyTheo')}
              onChange={(value) => setDraft({ ...draft, basis: value === 'COLLECTION' ? 'COLLECTION' : 'ATTEMPT' })}
              options={[
                { value: 'ATTEMPT', label: translate('organizer:reconciliationPage_batDauGiaoDich') },
                { value: 'COLLECTION', label: translate('organizer:reconciliationPage_xacMinhThuTien') },
              ]} />
          </label>
          {scope === 'admin' && <label className="workspace-records-field">{translate('organizer:reconciliationPage_toChuc')}
            <WorkspaceSelect value={draft.unattributed ? 'unattributed' : draft.organizationId}
              label={translate('organizer:reconciliationPage_toChuc')}
              onChange={(value) => setDraft({ ...draft, organizationId: value === 'unattributed' ? '' : value, unattributed: value === 'unattributed' })}
              options={[
                { value: '', label: translate('organizer:reconciliationPage_tatCaToChuc') },
                { value: 'unattributed', label: translate('organizer:reconciliationPage_chuaXacDinhToChuc') },
                ...organizations.map(({ id, name }) => ({ value: id, label: name })),
              ]} />
          </label>}
          <ConcertPicker concerts={concerts} value={draft.concertId} selection={selectedConcert}
            label={translate('organizer:reconciliationPage_buoiDien')} allLabel={translate('organizer:reconciliationPage_tatCaBuoiDien')}
            allowAll compact className="reconciliation-concert-picker"
            searchLabel={translate('organizer:reconciliationPage_timBuoiDien')} searching={concertsLoading}
            onSearch={(query) => {
              if (query === concertQuery) return;
              setOptionsError('');
              setConcertsLoading(true);
              setConcertQuery(query);
            }}
            onChange={(id) => {
              setSelectedConcert(concerts.find((concert) => concert.id === id));
              setDraft({ ...draft, concertId: id });
            }} />
          <button className="admin-primary-action" type="submit">{translate('organizer:reconciliationPage_apDung')}</button>
        </form>
        <p className="workspace-records-field-note">{translate('organizer:reconciliationPage_gioVietNamDoiChieuSaoKe')}</p>
        {(optionsError || exportError) && <p className="admin-notice error" role="alert">{exportError || optionsError}</p>}
      </section>
      {loading ? <p role="status">{translate("organizer:reconciliationPage_dangTaiGiaoDich")}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {report ? (
        <section className="workspace-records-panel reconciliation-results" aria-label={translate("organizer:reconciliationPage_giaoDichTrongKy")}>
          <dl className="reconciliation-metrics">
            <div><dt>{translate("organizer:reconciliationPage_doanhSoDonDaThanhToan")}</dt><dd>{currency.format(report.totals.paidOrderSales)}</dd></div>
            <div><dt>{translate("organizer:reconciliationPage_khoanThuDaXacMinh")}</dt><dd>{currency.format(report.totals.verifiedCollections)}</dd></div>
            <div><dt>{translate("organizer:reconciliationPage_giaoDichChoDongBo")}</dt><dd>{report.totals.missingSnapshots}</dd></div>
            <div><dt>{translate("organizer:reconciliationPage_lanNhanDuLieuGanNhatTrong")}</dt><dd>{date(report.totals.latestSnapshot)}</dd></div>
          </dl>
          <div className="admin-table-wrap" tabIndex={0} role="region" aria-label={translate('organizer:reconciliationPage_giaoDichTrongKy')}>
            <table className="admin-table">
              <thead><tr><th>{translate("organizer:reconciliationPage_donVaGiaoDich")}</th><th>{translate("organizer:reconciliationPage_thanhToan")}</th><th>{translate("organizer:reconciliationPage_khoiTao")}</th><th>{translate("organizer:reconciliationPage_xacMinhThu")}</th><th>{translate("organizer:reconciliationPage_daThu")}</th><th>{translate("organizer:reconciliationPage_hoanTienGhiNhan")}</th></tr></thead>
              <tbody>
                {report.content.map((row) => (
                  <tr key={`${row.intentId}:${row.orderId}`}>
                    <td>{row.concertTitle ?? translate("organizer:reconciliationPage_buoiDienChuaXacDinh")}<br /><code>{row.orderId}</code><br />{row.provider} · {row.transactionId ?? translate("organizer:reconciliationPage_chuaCoMaGiaoDich")}</td>
                    <td>{paymentStatus[row.paymentState] ?? row.paymentState}<br />{row.orderStatus ? orderStatus[row.orderStatus] ?? row.orderStatus : translate("organizer:reconciliationPage_chuaCoDonDoiChieu")}</td>
                    <td>{date(row.attemptedAt)}</td><td>{date(row.verifiedAt)}</td>
                    <td>{row.collectedAmount == null ? '—' : currency.format(row.collectedAmount)}</td>
                    <td>{row.refundAmount == null ? translate("organizer:reconciliationPage_chuaGhiNhan") : <>{currency.format(row.refundAmount)}<br />{row.refundReference}</>}</td>
                  </tr>
                ))}
                {!report.content.length ? <tr><td colSpan={6}>{translate("organizer:reconciliationPage_khongCoGiaoDichTrongKy")}</td></tr> : null}
              </tbody>
            </table>
          </div>
          {report.totals.transactions > report.size && <div className="reconciliation-pagination">
            <button className="admin-secondary-action" type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>{translate("organizer:reconciliationPage_trangTruoc")}</button>
            <span>{translate('reconciliationPageNumber', { page: page + 1, transactions: report.totals.transactions })}</span>
            <button className="admin-secondary-action" type="button" disabled={(page + 1) * report.size >= report.totals.transactions} onClick={() => setPage(page + 1)}>{translate('pageNext')}</button>
          </div>}
        </section>
      ) : null}
    </div>
  );
}
