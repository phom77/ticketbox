import { useEffect, useState, type FormEvent } from 'react';
import { getAdminConcerts, type ManagementApiScope } from '../../api/admin';
import { getApprovedOrganizations, type ApprovedOrganization } from '../../api/organizations';
import { downloadReconciliation, getReconciliation,
  type ReconciliationFilters, type ReconciliationReport } from '../../api/reconciliation';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { currency } from '../../data/formatters';

const dateTime = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh',
});
const dateInput = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
const paymentStatus: Record<string, string> = {
  PENDING_REPORT: 'Chờ đồng bộ', CREATED: 'Đã tạo', PROCESSING: 'Đang xử lý',
  READY: 'Chờ người mua', UNKNOWN: 'Chưa xác định', FAILED: 'Thất bại',
  SETTLEMENT_PENDING: 'Đã xác nhận thu, chờ xử lý đơn', SUCCEEDED: 'Đã xử lý',
  RECONCILIATION_REQUIRED: 'Tiền đến muộn, cần đối soát', REVIEW_REQUIRED: 'Cần kiểm tra',
};
const orderStatus: Record<string, string> = {
  AWAITING_PAYMENT: 'Chờ thanh toán', PAID: 'Đã thanh toán', EXPIRED: 'Hết hạn', CANCELLED: 'Đã hủy',
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
        if (!controller.signal.aborted) setOptionsError('Không tải được danh sách buổi diễn.');
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
        if (!controller.signal.aborted) setOptionsError('Không tải được danh sách tổ chức.');
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
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Không tải được báo cáo.');
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
      setExportError('Không thể tải CSV. Vui lòng thử lại.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <AdminPageHeader title="Đối soát thanh toán" description="Tra cứu khoản thu đã xác minh và các giao dịch cần kiểm tra." />
      <section className="admin-data-panel organization-panel">
        <form className="organization-form" onSubmit={apply}>
          <label className="admin-field">Từ ngày<input type="date" required value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></label>
          <label className="admin-field">Đến trước ngày<input type="date" required value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></label>
          <label className="admin-field">Kỳ theo<select value={draft.basis} onChange={(e) => setDraft({ ...draft, basis: e.target.value === 'COLLECTION' ? 'COLLECTION' : 'ATTEMPT' })}>
            <option value="ATTEMPT">Bắt đầu giao dịch</option><option value="COLLECTION">Xác minh thu tiền</option>
          </select></label>
          {scope === 'admin' ? (
            <label className="admin-field">Tổ chức<select value={draft.unattributed ? 'unattributed' : draft.organizationId}
              onChange={(e) => setDraft({ ...draft, organizationId: e.target.value, unattributed: e.target.value === 'unattributed' })}>
              <option value="">Tất cả tổ chức</option><option value="unattributed">Chưa xác định tổ chức</option>
              {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
            </select></label>
          ) : null}
          <label className="admin-field">Tìm buổi diễn<input type="search" value={concertQuery}
            onChange={(e) => { setConcertQuery(e.target.value); setDraft({ ...draft, concertId: '' }); }} /></label>
          <label className="admin-field">Buổi diễn<select value={draft.concertId} onChange={(e) => setDraft({ ...draft, concertId: e.target.value })}>
            <option value="">Tất cả buổi diễn</option>
            {concerts.map((concert) => <option key={concert.id} value={concert.id}>{concert.title}</option>)}
          </select></label>
          <button className="admin-primary-action" type="submit">Áp dụng</button>
          <button className="admin-secondary-action" type="button" disabled={!report || exporting} onClick={() => void exportCsv()}>
            {exporting ? 'Đang xuất…' : 'Tải CSV'}
          </button>
        </form>
        <p>Giờ Việt Nam. Đối chiếu sao kê bằng mã giao dịch của cổng.</p>
        {optionsError || exportError ? <p role="alert">{exportError || optionsError}</p> : null}
      </section>
      {loading ? <p role="status">Đang tải giao dịch…</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {report ? (
        <section className="admin-data-panel organization-panel" aria-label="Giao dịch trong kỳ">
          <dl className="concert-definition-list">
            <div><dt>Doanh số đơn đã thanh toán</dt><dd>{currency.format(report.totals.paidOrderSales)}</dd></div>
            <div><dt>Khoản thu đã xác minh</dt><dd>{currency.format(report.totals.verifiedCollections)}</dd></div>
            <div><dt>Giao dịch chờ đồng bộ</dt><dd>{report.totals.missingSnapshots}</dd></div>
            <div><dt>Lần nhận dữ liệu gần nhất trong kỳ</dt><dd>{date(report.totals.latestSnapshot)}</dd></div>
          </dl>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Đơn và giao dịch</th><th>Thanh toán</th><th>Khởi tạo</th><th>Xác minh thu</th><th>Đã thu</th><th>Hoàn tiền ghi nhận</th></tr></thead>
              <tbody>
                {report.content.map((row) => (
                  <tr key={`${row.intentId}:${row.orderId}`}>
                    <td>{row.concertTitle ?? 'Buổi diễn chưa xác định'}<br /><code>{row.orderId}</code><br />{row.provider} · {row.transactionId ?? 'Chưa có mã giao dịch'}</td>
                    <td>{paymentStatus[row.paymentState] ?? row.paymentState}<br />{row.orderStatus ? orderStatus[row.orderStatus] ?? row.orderStatus : 'Chưa có đơn đối chiếu'}</td>
                    <td>{date(row.attemptedAt)}</td><td>{date(row.verifiedAt)}</td>
                    <td>{row.collectedAmount == null ? '—' : currency.format(row.collectedAmount)}</td>
                    <td>{row.refundAmount == null ? 'Chưa ghi nhận' : <>{currency.format(row.refundAmount)}<br />{row.refundReference}</>}</td>
                  </tr>
                ))}
                {!report.content.length ? <tr><td colSpan={6}>Không có giao dịch trong kỳ.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="organization-form">
            <button className="admin-secondary-action" type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Trang trước</button>
            <span>Trang {page + 1} · {report.totals.transactions} giao dịch</span>
            <button className="admin-secondary-action" type="button" disabled={(page + 1) * report.size >= report.totals.transactions} onClick={() => setPage(page + 1)}>Trang sau</button>
          </div>
        </section>
      ) : null}
    </>
  );
}
