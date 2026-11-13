import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { getOrderSupportSection, type ManagementApiScope, type OrderSupportDetails } from '../../api/admin';
import { ApiClientError } from '../../api/client';
import { currency } from '../../data/formatters';
import { OrderRefundActions } from './OrderRefundActions';

const dateTime = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh',
});

const ticketLabels: Record<string, string> = {
  VALID: 'Hợp lệ', USED: 'Đã soát', CANCELLED: 'Đã hủy', TRANSFERRED: 'Đã chuyển nhượng',
};
const paymentLabels: Record<string, string> = {
  CREATED: 'Đã tạo', PROCESSING: 'Đang xử lý', READY: 'Chờ người mua', UNKNOWN: 'Chưa xác định',
  FAILED: 'Thất bại', SETTLEMENT_PENDING: 'Đã xác nhận thu, chờ xử lý đơn', SUCCEEDED: 'Đã xử lý',
  RECONCILIATION_REQUIRED: 'Tiền đến muộn, cần đối soát', REVIEW_REQUIRED: 'Cần kiểm tra',
  RESOLVED_MANUALLY: 'Đã ghi nhận hoàn tiền',
  REQUESTED: 'Chờ duyệt', HOLD_PENDING: 'Chờ xác nhận giữ vé', APPROVED: 'Đã duyệt', ABORTED: 'Đã đóng hồ sơ',
};
const deliveryLabels: Record<string, string> = {
  PENDING: 'Chờ gửi', SENT: 'Đã gửi', FAILED: 'Gửi thất bại', SKIPPED: 'Đã bỏ qua',
};

function date(value: string | null) {
  return value ? dateTime.format(new Date(value)) : '—';
}

type DetailScope = { orderId: string; scope: ManagementApiScope };
type LoadState<T> = { kind: 'loading' } | { kind: 'failure'; message: string } | { kind: 'ready'; data: T };

function OrderSupportSection<K extends keyof OrderSupportDetails>({ orderId, scope, section, title, children }: DetailScope & {
  section: K;
  title: string;
  children: (data: OrderSupportDetails[K], update: (change: (current: OrderSupportDetails[K]) => OrderSupportDetails[K]) => void,
    reload: () => void) => ReactNode;
}) {
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<LoadState<OrderSupportDetails[K]>>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    void getOrderSupportSection(orderId, section, scope, controller.signal).then((data) => {
      if (!controller.signal.aborted) setState({ kind: 'ready', data });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      const message = error instanceof ApiClientError && (error.status === 403 || error.status === 404)
        ? 'Bạn không có quyền xem mục này hoặc đơn hàng không còn khả dụng.'
        : 'Không thể tải mục này. Vui lòng thử lại.';
      setState({ kind: 'failure', message });
    });
    return () => controller.abort();
  }, [orderId, revision, scope, section]);

  function reload() {
    heading.current?.focus();
    setRevision((value) => value + 1);
  }

  return (
    <section className="admin-order-detail-section" aria-labelledby={headingId}>
      <h3 id={headingId} ref={heading} tabIndex={-1}>{title}</h3>
      {state.kind === 'loading' && <p role="status">Đang tải…</p>}
      {state.kind === 'failure' && <div className="admin-order-detail-error">
        <p role="alert">{state.message}</p>
        <button type="button" className="admin-secondary-action" onClick={reload}>Thử lại</button>
      </div>}
      {state.kind === 'ready' && children(state.data, (change) => {
        setState((current) => current.kind === 'ready' ? { kind: 'ready', data: change(current.data) } : current);
      }, reload)}
    </section>
  );
}

function DetailTable({ columns, rows, empty }: { columns: string[]; rows: { id: string; values: string[] }[]; empty: string }) {
  if (!rows.length) return <p>{empty}</p>;
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead><tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
        <tbody>{rows.map(({ id, values }) => (
          <tr key={id}>{values.map((value, index) => <td key={columns[index]}>{value}</td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function OrderSupportSections(props: DetailScope) {
  return (
    <>
      <OrderSupportSection {...props} section="payment" title="Thanh toán và ngoại lệ">
        {({ attempt, cases }, update, reload) => <>
          <DetailTable
            columns={['Cổng thanh toán', 'Trạng thái', 'Mã giao dịch', 'Xác nhận thu']}
            rows={attempt ? [{ id: 'attempt', values: [attempt.provider, paymentLabels[attempt.state] ?? attempt.state,
              attempt.transactionId || '—', date(attempt.verifiedAt)] }] : []}
            empty="Chưa có lần thanh toán nào."
          />
          <DetailTable
            columns={['Hồ sơ ngoại lệ', 'Trạng thái', 'Số tiền', 'Mã tham chiếu', 'Ghi nhận lúc']}
            rows={cases.map((item) => ({ id: item.id, values: [item.id, paymentLabels[item.state] ?? item.state,
              currency.format(item.amount), item.externalReference || '—', date(item.recordedAt)] }))}
            empty="Chưa có hồ sơ ngoại lệ."
          />
          {props.scope === 'admin' && <OrderRefundActions orderId={props.orderId} attempt={attempt} cases={cases}
            onReload={reload} onUpdate={(result) => update((current) => ({
              ...current,
              cases: [{ ...result, recordedAt: current.cases.find((item) => item.id === result.id)?.recordedAt ?? null },
                ...current.cases.filter((item) => item.id !== result.id)],
            }))} />}
        </>}
      </OrderSupportSection>
      <OrderSupportSection {...props} section="tickets" title="Vé đã phát hành">
        {(tickets) => <DetailTable
          columns={['Mã vé', 'Trạng thái', 'Phát hành lúc']}
          rows={tickets.map((ticket) => ({ id: ticket.id, values: [ticket.id, ticketLabels[ticket.status] ?? ticket.status, date(ticket.issuedAt)] }))}
          empty="Chưa có vé được phát hành."
        />}
      </OrderSupportSection>
      <OrderSupportSection {...props} section="delivery" title="Gửi email">
        {(deliveries) => <DetailTable
          columns={['Mã thông báo', 'Trạng thái', 'Cập nhật lúc']}
          rows={deliveries.map((item) => ({ id: item.id, values: [item.id, deliveryLabels[item.status] ?? item.status, date(item.updatedAt)] }))}
          empty="Chưa có email cho đơn này."
        />}
      </OrderSupportSection>
    </>
  );
}
