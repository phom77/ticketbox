import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useEffect, useState, type FormEvent } from 'react';
import { getAdminConcerts, type ManagementApiScope } from '../../api/admin';
import { getApprovedOrganizations, type ApprovedOrganization } from '../../api/organizations';
import { downloadReconciliation, getReconciliation,
  type ReconciliationFilters, type ReconciliationReport } from '../../api/reconciliation';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
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
  const [concerts, setConcerts] = useState<{ id: string; title: string }[]>([]);
  const [concertQuery, setConcertQuery] = useState('');
  const [optionsError, setOptionsError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void getAdminConcerts(0, 200, undefined, controller.signal, scope, concertQuery).then((value) => {
        if (!controller.signal.aborted) setConcerts(value.content);
      }).catch(() => {
        if (!controller.signal.aborted) setOptionsError(translate("organizer:reconciliationPage_khongTaiDuocDanhSachBuoiDien"));
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
    <>
      <AdminPageHeader title={translate("organizer:reconciliationPage_doiSoatThanhToan")} description={translate("organizer:reconciliationPage_traCuuKhoanThuDaXacMinh")} />
      <section className="admin-data-panel organization-panel">
        <form className="organization-form" onSubmit={apply}>
          <label className="admin-field">{translate("organizer:reconciliationPage_tuNgay")}<input type="date" required value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></label>
          <label className="admin-field">{translate("organizer:reconciliationPage_denTruocNgay")}<input type="date" required value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></label>
          <label className="admin-field">{translate("organizer:reconciliationPage_kyTheo")}<select value={draft.basis} onChange={(e) => setDraft({ ...draft, basis: e.target.value === 'COLLECTION' ? 'COLLECTION' : 'ATTEMPT' })}>
            <option value="ATTEMPT">{translate("organizer:reconciliationPage_batDauGiaoDich")}</option><option value="COLLECTION">{translate("organizer:reconciliationPage_xacMinhThuTien")}</option>
          </select></label>
          {scope === 'admin' ? (
            <label className="admin-field">{translate("organizer:reconciliationPage_toChuc")}<select value={draft.unattributed ? 'unattributed' : draft.organizationId}
              onChange={(e) => setDraft({ ...draft, organizationId: e.target.value, unattributed: e.target.value === 'unattributed' })}>
              <option value="">{translate("organizer:reconciliationPage_tatCaToChuc")}</option><option value="unattributed">{translate("organizer:reconciliationPage_chuaXacDinhToChuc")}</option>
              {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
            </select></label>
          ) : null}
          <label className="admin-field">{translate("organizer:reconciliationPage_timBuoiDien")}<input type="search" value={concertQuery}
            onChange={(e) => { setConcertQuery(e.target.value); setDraft({ ...draft, concertId: '' }); }} /></label>
          <label className="admin-field">{translate("organizer:reconciliationPage_buoiDien")}<select value={draft.concertId} onChange={(e) => setDraft({ ...draft, concertId: e.target.value })}>
            <option value="">{translate("organizer:reconciliationPage_tatCaBuoiDien")}</option>
            {concerts.map((concert) => <option key={concert.id} value={concert.id}>{concert.title}</option>)}
          </select></label>
          <button className="admin-primary-action" type="submit">{translate("organizer:reconciliationPage_apDung")}</button>
          <button className="admin-secondary-action" type="button" disabled={!report || exporting} onClick={() => void exportCsv()}>
            {exporting ? translate("organizer:reconciliationPage_dangXuat") : translate("organizer:reconciliationPage_taiCsv")}
          </button>
        </form>
        <p>{translate("organizer:reconciliationPage_gioVietNamDoiChieuSaoKe")}</p>
        {optionsError || exportError ? <p role="alert">{exportError || optionsError}</p> : null}
      </section>
      {loading ? <p role="status">{translate("organizer:reconciliationPage_dangTaiGiaoDich")}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {report ? (
        <section className="admin-data-panel organization-panel" aria-label={translate("organizer:reconciliationPage_giaoDichTrongKy")}>
          <dl className="concert-definition-list">
            <div><dt>{translate("organizer:reconciliationPage_doanhSoDonDaThanhToan")}</dt><dd>{currency.format(report.totals.paidOrderSales)}</dd></div>
            <div><dt>{translate("organizer:reconciliationPage_khoanThuDaXacMinh")}</dt><dd>{currency.format(report.totals.verifiedCollections)}</dd></div>
            <div><dt>{translate("organizer:reconciliationPage_giaoDichChoDongBo")}</dt><dd>{report.totals.missingSnapshots}</dd></div>
            <div><dt>{translate("organizer:reconciliationPage_lanNhanDuLieuGanNhatTrong")}</dt><dd>{date(report.totals.latestSnapshot)}</dd></div>
          </dl>
          <div className="admin-table-wrap">
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
          <div className="organization-form">
            <button className="admin-secondary-action" type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>{translate("organizer:reconciliationPage_trangTruoc")}</button>
            <span>{translate('reconciliationPageNumber', { page: page + 1, transactions: report.totals.transactions })}</span>
            <button className="admin-secondary-action" type="button" disabled={(page + 1) * report.size >= report.totals.transactions} onClick={() => setPage(page + 1)}>{translate('pageNext')}</button>
          </div>
        </section>
      ) : null}
    </>
  );
}
