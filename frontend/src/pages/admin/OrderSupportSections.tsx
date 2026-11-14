import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { getOrderSupportSection, type ManagementApiScope, type OrderSupportDetails } from '../../api/admin';
import { ApiClientError } from '../../api/client';
import { currency, dateFormatter } from '../../data/formatters';
import { OrderRefundActions } from './OrderRefundActions';

const dateTime = dateFormatter({
  dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh',
});

const ticketLabels: Record<string, string> = {
  get VALID() { return translate("admin:orderSupportSections_hopLe"); }, get USED() { return translate("admin:orderSupportSections_daSoat"); }, get CANCELLED() { return translate("admin:orderSupportSections_daHuy"); }, get TRANSFERRED() { return translate("admin:orderSupportSections_daChuyenNhuong"); },
};
const paymentLabels: Record<string, string> = {
  get CREATED() { return translate("admin:orderSupportSections_daTao"); }, get PROCESSING() { return translate("admin:orderSupportSections_dangXuLy"); }, get READY() { return translate("admin:orderSupportSections_choNguoiMua"); }, get UNKNOWN() { return translate("admin:orderSupportSections_chuaXacDinh"); },
  get FAILED() { return translate("admin:orderSupportSections_thatBai"); }, get SETTLEMENT_PENDING() { return translate("admin:orderSupportSections_daXacNhanThuChoXuLy"); }, get SUCCEEDED() { return translate('processed'); },
  get RECONCILIATION_REQUIRED() { return translate("admin:orderSupportSections_tienDenMuonCanDoiSoat"); }, get REVIEW_REQUIRED() { return translate("admin:orderSupportSections_canKiemTra"); },
  get RESOLVED_MANUALLY() { return translate("admin:orderSupportSections_daGhiNhanHoanTien"); },
  get REQUESTED() { return translate("admin:orderSupportSections_choDuyet"); }, get HOLD_PENDING() { return translate("admin:orderSupportSections_choXacNhanGiuVe"); }, get APPROVED() { return translate("admin:orderSupportSections_daDuyet"); }, get ABORTED() { return translate("admin:orderSupportSections_daDongHoSo"); },
};
const deliveryLabels: Record<string, string> = {
  get PENDING() { return translate("admin:orderSupportSections_choGui"); }, get SENT() { return translate("admin:orderSupportSections_daGui"); }, get FAILED() { return translate("admin:orderSupportSections_guiThatBai"); }, get SKIPPED() { return translate("admin:orderSupportSections_daBoQua"); },
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
  useTranslation();
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
        ? translate("admin:orderSupportSections_banKhongCoQuyenXemMucNay")
        : translate("admin:orderSupportSections_khongTheTaiMucNayVuiLong");
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
      {state.kind === 'loading' && <p role="status">{translate("admin:orderSupportSections_dangTai")}</p>}
      {state.kind === 'failure' && <div className="admin-order-detail-error">
        <p role="alert">{state.message}</p>
        <button type="button" className="admin-secondary-action" onClick={reload}>{translate("admin:orderSupportSections_thuLai")}</button>
      </div>}
      {state.kind === 'ready' && children(state.data, (change) => {
        setState((current) => current.kind === 'ready' ? { kind: 'ready', data: change(current.data) } : current);
      }, reload)}
    </section>
  );
}

function DetailTable({ columns, rows, empty }: { columns: string[]; rows: { id: string; values: string[] }[]; empty: string }) {
  useTranslation();
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
  useTranslation();
  return (
    <>
      <OrderSupportSection {...props} section="payment" title={translate("admin:orderSupportSections_thanhToanVaNgoaiLe")}>
        {({ attempt, cases }, update, reload) => <>
          <DetailTable
            columns={[translate("admin:orderSupportSections_congThanhToan"), translate("admin:orderSupportSections_trangThai"), translate("admin:orderSupportSections_maGiaoDich"), translate("admin:orderSupportSections_xacNhanThu")]}
            rows={attempt ? [{ id: 'attempt', values: [attempt.provider, paymentLabels[attempt.state] ?? attempt.state,
              attempt.transactionId || '—', date(attempt.verifiedAt)] }] : []}
            empty={translate("admin:orderSupportSections_chuaCoLanThanhToanNao")}
          />
          <DetailTable
            columns={[translate("admin:orderSupportSections_hoSoNgoaiLe"), translate("admin:orderSupportSections_trangThai"), translate("admin:orderSupportSections_soTien"), translate("admin:orderSupportSections_maThamChieu"), translate("admin:orderSupportSections_ghiNhanLuc")]}
            rows={cases.map((item) => ({ id: item.id, values: [item.id, paymentLabels[item.state] ?? item.state,
              currency.format(item.amount), item.externalReference || '—', date(item.recordedAt)] }))}
            empty={translate("admin:orderSupportSections_chuaCoHoSoNgoaiLe")}
          />
          {props.scope === 'admin' && <OrderRefundActions orderId={props.orderId} attempt={attempt} cases={cases}
            onReload={reload} onUpdate={(result) => update((current) => ({
              ...current,
              cases: [{ ...result, recordedAt: current.cases.find((item) => item.id === result.id)?.recordedAt ?? null },
                ...current.cases.filter((item) => item.id !== result.id)],
            }))} />}
        </>}
      </OrderSupportSection>
      <OrderSupportSection {...props} section="tickets" title={translate("admin:orderSupportSections_veDaPhatHanh")}>
        {(tickets) => <DetailTable
          columns={[translate("admin:orderSupportSections_maVe"), translate("admin:orderSupportSections_trangThai"), translate("admin:orderSupportSections_phatHanhLuc")]}
          rows={tickets.map((ticket) => ({ id: ticket.id, values: [ticket.id, ticketLabels[ticket.status] ?? ticket.status, date(ticket.issuedAt)] }))}
          empty={translate("admin:orderSupportSections_chuaCoVeDuocPhatHanh")}
        />}
      </OrderSupportSection>
      <OrderSupportSection {...props} section="delivery" title={translate("admin:orderSupportSections_guiEmail")}>
        {(deliveries) => <DetailTable
          columns={[translate("admin:orderSupportSections_maThongBao"), translate("admin:orderSupportSections_trangThai"), translate("admin:orderSupportSections_capNhatLuc")]}
          rows={deliveries.map((item) => ({ id: item.id, values: [item.id, deliveryLabels[item.status] ?? item.status, date(item.updatedAt)] }))}
          empty={translate("admin:orderSupportSections_chuaCoEmailChoDonNay")}
        />}
      </OrderSupportSection>
    </>
  );
}
