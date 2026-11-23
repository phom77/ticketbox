import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiClientError } from '../../api/client';
import { getAdminConcerts, type ManagementApiScope } from '../../api/admin';
import { getApprovedOrganizations, type ApprovedOrganization } from '../../api/organizations';
import { downloadReconciliation, getReconciliation,
  type ReconciliationFilters, type ReconciliationReport } from '../../api/reconciliation';
import { Download } from 'lucide-react';
import { ConcertPicker, type ConcertPickerItem } from '../../components/admin/ConcertPicker';
import { WorkspaceSelect } from '../../components/WorkspaceSelect';
import './WorkspaceRecords.css';
import { currency, dateFormatter, numberFormatter } from '../../data/formatters';

const dateTime = dateFormatter({
  dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh',
});
const dateInput = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
const integer = numberFormatter();
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

function validDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validPeriod({ from, to }: ReconciliationFilters) {
  return validDay(from) && validDay(to) && from < to;
}

export function ReconciliationPage({ scope, embedded = false }: { scope: ManagementApiScope; embedded?: boolean }) {
  useTranslation();
  const [params, setParams] = useSearchParams();
  const [defaults] = useState(initialFilters);
  const filter = useMemo<ReconciliationFilters>(() => ({
    from: params.get('from') ?? defaults.from,
    to: params.get('to') ?? defaults.to,
    basis: params.get('basis') === 'COLLECTION' ? 'COLLECTION' : 'ATTEMPT',
    organizationId: scope === 'admin' ? params.get('organizationId') ?? '' : '',
    concertId: params.get('concertId') ?? '',
    unattributed: scope === 'admin' && params.get('unattributed') === 'true',
  }), [defaults, params, scope]);
  const requestedPage = Number(params.get('page'));
  const page = Number.isInteger(requestedPage) && requestedPage >= 0 && requestedPage <= 2147483647 ? requestedPage : 0;
  const [draft, setDraft] = useState(filter);
  const [periodError, setPeriodError] = useState(false);
  const periodInvalid = !validPeriod(filter);
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([filter, page, retry]);
  const [result, setResult] = useState<{ key: string; report?: ReconciliationReport; error?: string; denied?: boolean }>();
  const active = result?.key === key ? result : undefined;
  const report = active?.report;
  const loading = !periodInvalid && !active;
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const exportRequest = useRef<AbortController | null>(null);
  const Title = embedded ? 'h2' : 'h1';
  const [organizations, setOrganizations] = useState<ApprovedOrganization[]>([]);
  const [concerts, setConcerts] = useState<ConcertPickerItem[]>([]);
  const [selectedConcert, setSelectedConcert] = useState<ConcertPickerItem>();
  const [concertQuery, setConcertQuery] = useState('');
  const [concertsLoading, setConcertsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState('');

  useEffect(() => {
    setDraft(filter);
    setPeriodError(false);
  }, [filter]);

  useLayoutEffect(() => () => {
    exportRequest.current?.abort();
    exportRequest.current = null;
  }, [key]);

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
    if (periodInvalid) return;
    const controller = new AbortController();
    void getReconciliation(scope, filter, page, controller.signal).then((report) => {
      if (!controller.signal.aborted) setResult({ key, report });
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setResult({
        key,
        error: failure instanceof Error ? failure.message : translate('organizer:reconciliationPage_khongTaiDuocBaoCao'),
        denied: failure instanceof ApiClientError && failure.status === 403,
      });
    });
    return () => controller.abort();
  }, [scope, filter, page, key, periodInvalid]);

  function apply(event: FormEvent) {
    event.preventDefault();
    if (!validPeriod(draft)) {
      setPeriodError(true);
      return;
    }
    setPeriodError(false);
    const next = new URLSearchParams(params);
    for (const [name, value] of Object.entries(draft)) {
      if (value) next.set(name, String(value));
      else next.delete(name);
    }
    next.delete('page');
    if (params.toString() === next.toString()) setRetry((value) => value + 1);
    else setParams(next);
  }

  function setPage(index: number) {
    const next = new URLSearchParams(params);
    if (index > 0) next.set('page', String(index));
    else next.delete('page');
    setParams(next);
  }

  async function exportCsv() {
    const controller = new AbortController();
    exportRequest.current?.abort();
    exportRequest.current = controller;
    setExporting(true);
    setExportError('');
    try {
      const blob = await downloadReconciliation(scope, filter, controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'doi-soat-thanh-toan.csv';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure instanceof ApiClientError && failure.status === 403) {
        setResult({ key, denied: true });
        return;
      }
      setExportError(translate('organizer:reconciliationPage_khongTheTaiCsvVuiLongThu'));
    } finally {
      if (!controller.signal.aborted) setExporting(false);
    }
  }

  useEffect(() => {
    setExporting(false);
    setExportError('');
  }, [key]);

  const showPeriodError = periodError || periodInvalid;
  if (active?.denied) return (
    <div className="workspace-records-panel operations-report-message">
      <p role="alert">{translate(scope === 'organizer' ? 'operations-reports:financeAccess' : 'operations-reports:unavailableView')}</p>
      <Link to={`/${scope}`} className="admin-secondary-action">{translate('operations-reports:backToDashboard')}</Link>
    </div>
  );

  return (
    <div className="workspace-records">
      <header className="workspace-records-header">
        <div>
          <Title>{translate('organizer:reconciliationPage_doiSoatThanhToan')}</Title>
        </div>
        <button className="admin-secondary-action" type="button" disabled={!report || exporting} onClick={() => void exportCsv()}>
          <Download size={18} aria-hidden />
          {exporting ? translate('organizer:reconciliationPage_dangXuat') : translate('organizer:reconciliationPage_taiCsv')}
        </button>
      </header>
      <section className="workspace-records-panel reconciliation-panel">
        <form className="reconciliation-filters" data-scope={scope} noValidate onSubmit={apply}>
          <label className="workspace-records-field">{translate('organizer:reconciliationPage_tuNgay')}
            <input type="date" required aria-invalid={showPeriodError || undefined} aria-describedby={showPeriodError ? "reconciliation-period-error" : undefined} value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} />
          </label>
          <label className="workspace-records-field">{translate('organizer:reconciliationPage_denTruocNgay')}
            <input type="date" required aria-invalid={showPeriodError || undefined} aria-describedby={showPeriodError ? "reconciliation-period-error" : undefined} value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} />
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
            label={translate('organizer:reconciliationPage_buoiDien')} placeholder={translate('operations-reports:selectedConcert')} allLabel={translate('organizer:reconciliationPage_tatCaBuoiDien')}
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
        <p className="workspace-records-field-note">{translate('operations-reports:reconciliationPeriod')}</p>
        {scope === 'admin' && <p className="workspace-records-field-note">{translate('operations-reports:reconciliationAdminScope')}</p>}
        {showPeriodError && <p id="reconciliation-period-error" className="admin-notice error" role="alert">{translate('operations-reports:reconciliationInvalidPeriod')}</p>}
        {(optionsError || exportError) && <p className="admin-notice error" role="alert">{exportError || optionsError}</p>}
      </section>
      {loading ? <p role="status">{translate("organizer:reconciliationPage_dangTaiGiaoDich")}</p> : null}
      {active?.error && <div className="workspace-records-panel operations-report-message">
        <p role="alert">{active.error}</p>
        <button className="admin-secondary-action" type="button" onClick={() => setRetry((value) => value + 1)}>{translate('operations-reports:retry')}</button>
      </div>}
      {report ? (
        <section className="workspace-records-panel reconciliation-results" aria-label={translate("organizer:reconciliationPage_giaoDichTrongKy")}>
          <dl className="reconciliation-metrics">
            <div><dt>{translate('operations-reports:reconciliationCount')}</dt><dd>{integer.format(report.totals.transactions)}</dd></div>
            <div><dt>{translate("organizer:reconciliationPage_doanhSoDonDaThanhToan")}</dt><dd>{currency.format(report.totals.paidOrderSales)}</dd></div>
            <div><dt>{translate("organizer:reconciliationPage_khoanThuDaXacMinh")}</dt><dd>{currency.format(report.totals.verifiedCollections)}</dd></div>
            <div><dt>{translate("organizer:reconciliationPage_giaoDichChoDongBo")}</dt><dd>{report.totals.missingSnapshots}</dd></div>
            <div><dt>{translate("organizer:reconciliationPage_lanNhanDuLieuGanNhatTrong")}</dt><dd>{date(report.totals.latestSnapshot)}</dd></div>
          </dl>
          <div className="admin-table-wrap" tabIndex={0} role="region" aria-label={translate('organizer:reconciliationPage_giaoDichTrongKy')}>
            <table className="admin-table">
              <thead><tr><th>{translate("organizer:reconciliationPage_donVaGiaoDich")}</th><th>{translate("organizer:reconciliationPage_thanhToan")}</th><th>{translate("organizer:reconciliationPage_khoiTao")}</th><th>{translate("organizer:reconciliationPage_xacMinhThu")}</th><th>{translate("organizer:reconciliationPage_daThu")}</th><th>{translate("organizer:reconciliationPage_hoanTienGhiNhan")}</th><th>{translate('operations-reports:reconciliationSync')}</th></tr></thead>
              <tbody>
                {report.content.map((row) => (
                  <tr key={`${row.intentId}:${row.orderId}`}>
                    <td>{row.concertTitle ?? translate("organizer:reconciliationPage_buoiDienChuaXacDinh")}<br /><code>{row.orderId}</code><br />{row.provider} · {row.transactionId ?? translate("organizer:reconciliationPage_chuaCoMaGiaoDich")}</td>
                    <td>{paymentStatus[row.paymentState] ?? row.paymentState}<br />{row.orderStatus ? orderStatus[row.orderStatus] ?? row.orderStatus : translate("organizer:reconciliationPage_chuaCoDonDoiChieu")}</td>
                    <td>{date(row.attemptedAt)}</td><td>{date(row.verifiedAt)}</td>
                    <td>{row.collectedAmount == null ? '—' : currency.format(row.collectedAmount)}</td>
                    <td>{row.refundAmount == null ? translate("organizer:reconciliationPage_chuaGhiNhan") : <>{currency.format(row.refundAmount)}<br />{row.refundReference}</>}</td>
                    <td>{row.receivedAt ? date(row.receivedAt) : translate('operations-reports:awaitingSync')}</td>
                  </tr>
                ))}
                {!report.content.length ? <tr><td colSpan={7}>{translate("organizer:reconciliationPage_khongCoGiaoDichTrongKy")}</td></tr> : null}
              </tbody>
            </table>
          </div>
          {(report.totals.transactions > report.size || page > 0) && <div className="reconciliation-pagination">
            <button className="admin-secondary-action" type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>{translate("organizer:reconciliationPage_trangTruoc")}</button>
            <span>{translate('reconciliationPageNumber', { page: page + 1, transactions: report.totals.transactions })}</span>
            <button className="admin-secondary-action" type="button" disabled={(page + 1) * report.size >= report.totals.transactions} onClick={() => setPage(page + 1)}>{translate('pageNext')}</button>
          </div>}
        </section>
      ) : null}
    </div>
  );
}
