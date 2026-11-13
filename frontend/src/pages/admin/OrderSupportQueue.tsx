import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ApiClientError } from '../../api/client';
import { getSupportQueue, retrySupportItem, type SupportQueueItem, type SupportQueueKind, type SupportQueuePage } from '../../api/supportQueue';
import './OrderSupportQueue.css';

const categories: Record<SupportQueueKind, string> = {
  UNKNOWN_PAYMENT: 'Giao dịch chưa rõ kết quả',
  MISSING_TICKETS: 'Đã thanh toán, thiếu vé',
  PENDING_REFUND: 'Chờ xử lý hoàn tiền',
  FAILED_EMAIL: 'Email vé gửi lỗi',
};

const states: Record<string, string> = {
  UNKNOWN: 'Chưa xác định',
  REVIEW_REQUIRED: 'Cần kiểm tra',
  SETTLEMENT_PENDING: 'Đang xử lý đơn đã thanh toán',
  SUCCEEDED: 'Đã xác nhận thanh toán',
  RECONCILIATION_REQUIRED: 'Chờ đối soát khoản thu',
  FAILED: 'Gửi thất bại',
  SKIPPED: 'Đã bỏ qua',
};

const dateTime = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh',
});

function retryLabel(kind: SupportQueueKind) {
  if (kind === 'UNKNOWN_PAYMENT') return 'Kiểm tra lại giao dịch';
  if (kind === 'FAILED_EMAIL') return 'Gửi lại email';
  return null;
}

export function OrderSupportQueue() {
  const [kind, setKind] = useState<SupportQueueKind>('UNKNOWN_PAYMENT');
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<SupportQueuePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: SupportQueueKind; message: string; failed: boolean } | null>(null);
  const actionIds = useRef(new Map<string, string>());
  const inFlight = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const category = useRef(kind);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void getSupportQueue(kind, page, controller.signal).then((data) => {
      if (controller.signal.aborted || category.current !== kind) return;
      const lastPage = Math.max(0, data.totalPages - 1);
      if (page > lastPage) {
        setPage(lastPage);
        return;
      }
      setResult(data);
      setLoading(false);
    }).catch((failure: unknown) => {
      if (controller.signal.aborted || category.current !== kind) return;
      setError(failure instanceof ApiClientError && failure.status === 403
        ? 'Bạn không có quyền xem danh sách này.'
        : 'Không thể tải danh sách. Vui lòng thử lại.');
      setLoading(false);
    });
    return () => controller.abort();
  }, [kind, page, revision]);

  function selectCategory(next: SupportQueueKind) {
    category.current = next;
    setResult(null);
    setLoading(true);
    setError('');
    setPage(0);
    setKind(next);
  }

  function changePage(next: number) {
    if (loading || !result || next < 0 || next >= result.totalPages) return;
    setLoading(true);
    setError('');
    setPage(next);
  }

  async function retryItem(item: SupportQueueItem, button: HTMLButtonElement) {
    if (inFlight.current || !item.retryable || (kind !== 'UNKNOWN_PAYMENT' && kind !== 'FAILED_EMAIL')) return;
    const identity = `${kind}:${item.sourceId}`;
    inFlight.current = true;
    setPending(identity);
    setFeedback(null);
    try {
      const actionId = actionIds.current.get(identity) ?? crypto.randomUUID();
      actionIds.current.set(identity, actionId);
      await retrySupportItem(kind, item, actionId);
      actionIds.current.delete(identity);
      setFeedback({ kind, message: 'Đã tiếp nhận yêu cầu.', failed: false });
      if (category.current === kind) {
        if (button === document.activeElement) heading.current?.focus();
        setRevision((value) => value + 1);
      }
    } catch (failure) {
      const message = failure instanceof ApiClientError && failure.status === 403
        ? 'Bạn không có quyền thực hiện thao tác này.'
        : 'Chưa thể xác nhận thao tác. Hãy thử lại.';
      setFeedback({ kind, message, failed: true });
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  }

  const label = retryLabel(kind);
  const activeFeedback = feedback?.kind === kind ? feedback : null;

  return (
    <section className="admin-data-panel order-support-queue" aria-labelledby="order-support-queue-title">
      <header className="order-support-queue-header">
        <h2 id="order-support-queue-title" ref={heading} tabIndex={-1}>Việc cần xử lý</h2>
        <label>
          <span>Loại ngoại lệ</span>
          <select value={kind} onChange={(event) => selectCategory(event.target.value as SupportQueueKind)}>
            {Object.entries(categories).map(([value, name]) => <option value={value} key={value}>{name}</option>)}
          </select>
        </label>
      </header>
      {activeFeedback && <p className={`admin-notice ${activeFeedback.failed ? 'error' : 'success'}`}
        role={activeFeedback.failed ? 'alert' : 'status'}>{activeFeedback.message}</p>}
      {loading && <p className="order-support-queue-message" role="status">Đang tải danh sách…</p>}
      {error && <div className="order-support-queue-error">
        <p role="alert">{error}</p>
        <button type="button" className="admin-secondary-action" onClick={() => {
          heading.current?.focus();
          setRevision((value) => value + 1);
        }}>Tải lại danh sách</button>
      </div>}
      {!loading && !error && result && (result.content.length ? (
        <ul className="order-support-queue-list">
          {result.content.map((item) => (
            <li key={item.sourceId}>
              <div>
                <Link to={`/admin/orders?${new URLSearchParams({ orderId: item.orderId })}`}>{item.orderId}</Link>
                <p>{states[item.state] ?? item.state} · <time dateTime={item.updatedAt}>{dateTime.format(new Date(item.updatedAt))}</time></p>
              </div>
              {label && item.retryable && (
                <button type="button" className="admin-secondary-action" aria-disabled={pending !== null}
                  onClick={(event) => void retryItem(item, event.currentTarget)}>
                  {pending === `${kind}:${item.sourceId}` ? 'Đang gửi yêu cầu…' : label}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : <p className="order-support-queue-message">Không có trường hợp cần xử lý.</p>)}
      {result && result.totalPages > 1 && !error && <div className="admin-pagination order-support-queue-pagination">
        <span>Trang {page + 1} / {result.totalPages}</span>
        <div>
          <button type="button" aria-label="Trang trước" aria-disabled={loading || page === 0} onClick={() => changePage(page - 1)}><ChevronLeft size={16} aria-hidden="true" /></button>
          <button type="button" aria-label="Trang sau" aria-disabled={loading || page + 1 >= result.totalPages} onClick={() => changePage(page + 1)}><ChevronRight size={16} aria-hidden="true" /></button>
        </div>
      </div>}
    </section>
  );
}
