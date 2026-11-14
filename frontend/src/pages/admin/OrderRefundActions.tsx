import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { decideOrderRefund, type OrderSupportDetails, type RefundCase, type RefundCommand, type RefundDecision } from '../../api/admin';
import { ApiClientError } from '../../api/client';
import { currency } from '../../data/formatters';
import { useAuth } from '../../features/auth/AuthContext';
import './OrderRefundActions.css';

const actions = {
  REQUEST: { get open() { return translate("admin:orderRefundActions_yeuCauHoanToanDon"); }, get submit() { return translate("admin:orderRefundActions_guiYeuCauHoanTien"); } },
  APPROVE: { get open() { return translate("admin:orderRefundActions_duyetYeuCau"); }, get submit() { return translate("admin:orderRefundActions_xacNhanDuyet"); } },
  CONFIRM: { get open() { return translate("admin:orderRefundActions_ghiNhanKetQuaHoanTien"); }, get submit() { return translate("admin:orderRefundActions_xacNhanDaHoanTien"); } },
  ABORT: { get open() { return translate("admin:orderRefundActions_dongHoSoChuaHoanTien"); }, get submit() { return translate("admin:orderRefundActions_xacNhanDongHoSo"); } },
} satisfies Record<RefundDecision, { open: string; submit: string }>;

type Payment = OrderSupportDetails['payment'];
type Props = Payment & { orderId: string; onUpdate: (result: RefundCase) => void; onReload: () => void };

function vietnamTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return '';
  return `${value.length === 16 ? `${value}:00` : value}+07:00`;
}

export function OrderRefundActions({ orderId, attempt, cases, onUpdate, onReload }: Props) {
  useTranslation();
  const { user } = useAuth();
  const current = cases[0];
  const verified = attempt?.verifiedAt && attempt.transactionId &&
    Number.isSafeInteger(attempt.requestedAmount) && attempt.requestedAmount >= 0 &&
    (attempt.state === 'SUCCEEDED' || attempt.state === 'RECONCILIATION_REQUIRED');
  const canRequest = verified && (!current || (current.state === 'REVIEW_REQUIRED' && !current.requestedBy));
  const canApprove = current?.state === 'REQUESTED' && !!current.requestedBy && current.requestedBy !== user?.id;
  const canResume = current?.state === 'HOLD_PENDING' && current.approvedBy === user?.id;
  const approved = current?.state === 'APPROVED';
  const canAbort = current && ['REQUESTED', 'HOLD_PENDING', 'APPROVED'].includes(current.state);

  const [action, setAction] = useState<RefundDecision | null>(null);
  const [detail, setDetail] = useState('');
  const [reference, setReference] = useState('');
  const [time, setTime] = useState('');
  const [noMoneySent, setNoMoneySent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [error, setError] = useState<{ message: string; blocked?: boolean } | null>(null);
  const [notice, setNotice] = useState('');
  const replay = useRef<RefundCommand | null>(null);
  const savingRef = useRef(false);
  const reason = useRef<HTMLTextAreaElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (action) reason.current?.focus();
  }, [action]);

  function open(next: RefundDecision) {
    replay.current = null;
    setReplaying(false);
    setError(null);
    setNotice('');
    setDetail('');
    setReference('');
    setTime('');
    setNoMoneySent(false);
    setAction(next);
  }

  const occurredAt = vietnamTime(time);
  const locked = saving || replaying;
  const amount = current?.amount ?? attempt?.requestedAmount;
  const validEvidence = action !== 'CONFIRM' || (reference.trim().length > 0 && occurredAt &&
    Number.isSafeInteger(amount) && Date.parse(occurredAt) <= Date.now() &&
    (!attempt?.verifiedAt || Date.parse(occurredAt) >= Date.parse(attempt.verifiedAt)));
  const canSubmit = detail.trim() && validEvidence && (action !== 'ABORT' || noMoneySent) && !error?.blocked;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || !canSubmit || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setNotice('');
    try {
      const command = replay.current ?? {
        actionId: crypto.randomUUID(), caseId: current?.id, action, detail: detail.trim(),
        ...(action === 'CONFIRM' ? { amount, externalReference: reference.trim(), occurredAt } : {}),
      };
      replay.current = command;
      const { data } = await decideOrderRefund(orderId, command);
      onUpdate(data);
      if (data.state === 'HOLD_PENDING' && action === 'APPROVE') {
        setReplaying(true);
        return;
      }
      if (action === 'CONFIRM') setNotice(translate("admin:orderRefundActions_daGhiNhanKetQuaHoanTien"));
      if (action === 'ABORT') setNotice(translate("admin:orderRefundActions_daDongHoSo"));
      replay.current = null;
      setReplaying(false);
      setAction(null);
      heading.current?.focus();
    } catch (failure) {
      const status = failure instanceof ApiClientError ? failure.status : 500;
      if (status >= 500) {
        setReplaying(true);
        setError({ message: translate("admin:orderRefundActions_chuaNhanDuocKetQuaThuLai") });
      } else if (status === 400) {
        replay.current = null;
        setReplaying(false);
        setError({ message: translate("admin:orderRefundActions_thongTinChuaHopLeVuiLong") });
      } else {
        setError({ blocked: true, message: status === 403
          ? translate("admin:orderRefundActions_banKhongCoQuyenThucHienThao")
          : translate("admin:orderRefundActions_khongTheTiepTucVoiTrangThai") });
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (user?.role !== 'ADMIN' || (!canRequest && !canAbort && !notice && !action)) return null;

  return (
    <div className="order-refund-actions">
      <h4 ref={heading} tabIndex={-1}>{translate("admin:orderRefundActions_hoanToanDon")}</h4>
      {notice && <p role="status">{notice}</p>}
      {current?.state === 'REQUESTED' && !canApprove && <p>{translate("admin:orderRefundActions_choAdminKhacDuyet")}</p>}
      {current?.state === 'HOLD_PENDING' && <p role="status">
        {canResume ? translate("admin:orderRefundActions_dangChoXacNhanGiuVeCo") : translate("admin:orderRefundActions_dangChoAdminPhuTrachXacNhan")}
      </p>}
      {approved && <p>
        {translate('admin:orderRefundActions_recordProviderRefund', { provider: attempt?.provider ?? '' })}
      </p>}
      {!action ? <div className="order-refund-buttons">
        {canRequest && <button type="button" className="admin-secondary-action" onClick={() => open('REQUEST')}>{actions.REQUEST.open}</button>}
        {(canApprove || canResume) && <button type="button" className="admin-secondary-action" onClick={() => open('APPROVE')}>
          {canResume ? translate("admin:orderRefundActions_kiemTraGiuVeVaDuyetLai") : actions.APPROVE.open}
        </button>}
        {approved && <button type="button" className="admin-secondary-action" onClick={() => open('CONFIRM')}>{actions.CONFIRM.open}</button>}
        {canAbort && <button type="button" className="admin-secondary-action" onClick={() => open('ABORT')}>{actions.ABORT.open}</button>}
      </div> : (
        <form className="order-refund-form" onSubmit={(event) => void submit(event)}>
          <p>{actions[action].open}</p>
          {(action === 'CONFIRM' || action === 'REQUEST') && typeof amount === 'number' &&
            <p>{translate("admin:orderRefundActions_soTienHoanToanDon")} <strong>{currency.format(amount)}</strong></p>}
          <label className="admin-field">
            {translate("admin:orderRefundActions_lyDo")}
            <textarea ref={reason} rows={2} required maxLength={1000} readOnly={locked} value={detail}
              onChange={(event) => setDetail(event.target.value)} />
          </label>
          {action === 'CONFIRM' && <div className="admin-form-grid">
            <label className="admin-field">
              {translate("admin:orderRefundActions_maThamChieuHoanTien")}
              <input value={reference} onChange={(event) => setReference(event.target.value)}
                maxLength={255} required readOnly={locked} />
            </label>
            <label className="admin-field">
              {translate("admin:orderRefundActions_thoiDiemHoanTienGioVietNam")}
              <input type="datetime-local" step={1} value={time} onChange={(event) => setTime(event.target.value)}
                required readOnly={locked} />
            </label>
            {time && !validEvidence && <p className="admin-field-wide">{translate("admin:orderRefundActions_thoiDiemPhaiTuLucXacNhan")}</p>}
          </div>}
          {action === 'ABORT' && <label className="order-refund-check">
            <input type="checkbox" checked={noMoneySent} required disabled={locked} onChange={(event) => setNoMoneySent(event.target.checked)} />
            {translate("admin:orderRefundActions_toiXacNhanChuaGuiKhoanHoan")}
          </label>}
          {error && <p className="admin-notice error" role="alert">{error.message}</p>}
          <div className="order-refund-buttons">
            <button type="submit" className="admin-primary-action" disabled={saving || !canSubmit}>
              {saving ? translate("admin:orderRefundActions_dangGuiYeuCau") : actions[action].submit}
            </button>
            {locked || error?.blocked ? (
              <button type="button" className="admin-secondary-action" disabled={saving} onClick={onReload}>{translate("admin:orderRefundActions_taiLaiTrangThai")}</button>
            ) : (
              <button type="button" className="admin-secondary-action" onClick={() => {
                setAction(null);
                heading.current?.focus();
              }}>{translate("admin:orderRefundActions_quayLai")}</button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
