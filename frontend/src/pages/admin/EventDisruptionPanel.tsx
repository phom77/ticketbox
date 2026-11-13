import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiClientError } from '../../api/client';
import type { ConcertStatus } from '../../api/concerts';
import {
  getDisruption, getDisruptionImpact, resumeDisruption, startDisruption,
  type DisruptionCommand, type DisruptionImpactPage, type DisruptionKind, type EventDisruption,
} from '../../api/eventDisruptions';
import './EventDisruptionPanel.css';

const disruptionStates: Record<EventDisruption['state'], string> = {
  PAUSING: 'Đang tạm dừng', PAUSED: 'Đã tạm dừng', CANCELLED: 'Đã hủy',
  RESUMING: 'Đang mở lại', RESUMED: 'Đã mở lại',
};
const orderStates: Record<string, string> = {
  PAID: 'Đã thanh toán', AWAITING_PAYMENT: 'Chờ thanh toán', CANCELLED: 'Đã hủy',
  EXPIRED: 'Đã hết hạn', REFUNDED: 'Đã hoàn tiền',
};
const paymentStates: Record<string, string> = {
  SUCCEEDED: 'Thành công', PENDING: 'Đang chờ', UNKNOWN: 'Chưa xác định', FAILED: 'Thất bại',
  RECONCILIATION_REQUIRED: 'Chờ đối soát', SETTLEMENT_PENDING: 'Đang xử lý khoản thu',
};
const dateTime = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh',
});
const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
const scheduleFields = [
  { name: 'eventDate', label: 'Thời điểm diễn mới', required: true },
  { name: 'doorsOpenAt', label: 'Mở cửa từ', required: false },
  { name: 'saleStartAt', label: 'Mở bán lại từ', required: true },
  { name: 'saleEndAt', label: 'Kết thúc bán', required: false },
] as const;
const emptySchedule = { eventDate: '', doorsOpenAt: '', saleStartAt: '', saleEndAt: '' };

function vietnamTime(value: string) {
  return value ? `${value}:00+07:00` : undefined;
}

export function EventDisruptionPanel({ concertId, concertStatus, onChanged }: {
  concertId: string;
  concertStatus: ConcertStatus;
  onChanged: (signal: AbortSignal) => void;
}) {
  const [status, setStatus] = useState<EventDisruption | null>();
  const [statusError, setStatusError] = useState(false);
  const [statusRevision, setStatusRevision] = useState(0);
  const [impact, setImpact] = useState<DisruptionImpactPage | null>(null);
  const [impactLoading, setImpactLoading] = useState(true);
  const [impactError, setImpactError] = useState(false);
  const [impactRevision, setImpactRevision] = useState(0);
  const [page, setPage] = useState(0);
  const [kind, setKind] = useState<DisruptionKind | ''>('');
  const [reason, setReason] = useState('');
  const [schedule, setSchedule] = useState(emptySchedule);
  const [confirmed, setConfirmed] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<DisruptionCommand | null>(null);
  const [pendingResume, setPendingResume] = useState(false);
  const [busy, setBusy] = useState(false);
  const [commandError, setCommandError] = useState('');
  const [conflict, setConflict] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const workspaceRefresh = useRef<AbortController | null>(null);
  const operationsAllowed = concertStatus === 'ON_SALE' || concertStatus === 'SOLD_OUT';
  const phase = status?.state;

  useEffect(() => () => workspaceRefresh.current?.abort(), []);

  const finishCommand = useCallback(() => {
    setPendingCommand(null);
    setPendingResume(false);
    setCommandError('');
    setKind('');
    setReason('');
    setConfirmed(false);
    setSchedule(emptySchedule);
    if (heading.current) {
      heading.current.focus();
      workspaceRefresh.current?.abort();
      workspaceRefresh.current = new AbortController();
      onChanged(workspaceRefresh.current.signal);
    }
  }, [onChanged]);

  const accepted = status && (status.id === pendingCommand?.actionId
    || (pendingResume && (phase === 'RESUMING' || phase === 'RESUMED')));
  useEffect(() => {
    if (accepted && !busy) finishCommand();
  }, [accepted, busy, finishCommand]);

  useEffect(() => {
    if (busy) return;
    const controller = new AbortController();
    let timer: number | undefined;
    async function loadStatus() {
      try {
        const data = await getDisruption(concertId, controller.signal);
        if (controller.signal.aborted) return;
        setStatus(data);
        setStatusError(false);
        if (data?.state === 'PAUSING' || data?.state === 'RESUMING') timer = window.setTimeout(loadStatus, 3000);
      } catch {
        if (!controller.signal.aborted) setStatusError(true);
      }
    }
    void loadStatus();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [busy, concertId, statusRevision]);

  const operationId = status?.id;
  const processed = status?.processed;
  const showImpact = !!operationId || operationsAllowed;
  useEffect(() => {
    if (!showImpact) return;
    const controller = new AbortController();
    setImpactLoading(true);
    setImpactError(false);
    void getDisruptionImpact(concertId, page, controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      const lastPage = Math.max(0, data.totalPages - 1);
      if (page > lastPage) {
        setPage(lastPage);
        return;
      }
      setImpact(data);
      setImpactLoading(false);
    }).catch(() => {
      if (controller.signal.aborted) return;
      setImpactError(true);
      setImpactLoading(false);
    });
    return () => controller.abort();
  }, [concertId, impactRevision, operationId, page, processed, showImpact]);

  const showForm = operationsAllowed && (status === null || phase === 'RESUMED');
  const scheduleReady = kind !== 'POSTPONE' || !!(schedule.eventDate && schedule.saleStartAt);

  function reloadStatus() {
    setStatusError(false);
    setStatus(undefined);
    setConflict(false);
    setCommandError('');
    setStatusRevision((value) => value + 1);
  }

  function refreshImpact(nextPage = page) {
    setImpactLoading(true);
    setImpactError(false);
    if (nextPage === page) setImpactRevision((value) => value + 1);
    else setPage(nextPage);
  }

  function selectKind(next: DisruptionKind | '') {
    setKind(next);
    setConfirmed(false);
    setSchedule(emptySchedule);
    setCommandError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!kind || busy || !showForm || !confirmed || !reason.trim() || !scheduleReady || !impact || impactLoading || impactError || statusError || conflict) return;
    const command = pendingCommand ?? {
      actionId: crypto.randomUUID(), kind, reason: reason.trim(),
      ...(kind === 'POSTPONE' && {
        eventDate: vietnamTime(schedule.eventDate), doorsOpenAt: vietnamTime(schedule.doorsOpenAt),
        saleStartAt: vietnamTime(schedule.saleStartAt), saleEndAt: vietnamTime(schedule.saleEndAt),
      }),
    };
    setPendingCommand(command);
    await send(() => startDisruption(concertId, command));
  }

  async function send(request: () => Promise<{ data: EventDisruption }>) {
    setBusy(true);
    setCommandError('');
    try {
      const { data } = await request();
      setStatus(data);
      finishCommand();
    } catch (failure) {
      if (failure instanceof ApiClientError && failure.status < 500) {
        setPendingCommand(null);
        setPendingResume(false);
        if (failure.status === 409) {
          setConflict(true);
          setCommandError('Trạng thái buổi diễn đã thay đổi. Hãy tải lại trạng thái.');
        } else {
          setCommandError(failure.message);
        }
      } else {
        setCommandError('Chưa thể xác nhận thao tác. Hãy thử lại.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="concert-workspace-card event-disruption" aria-labelledby="event-disruption-title">
      <header className="event-disruption-heading">
        <h2 id="event-disruption-title" ref={heading} tabIndex={-1}>Hoãn hoặc hủy buổi diễn</h2>
        {(status || statusError || conflict) && <button type="button" className="admin-secondary-action"
          disabled={busy} onClick={reloadStatus}>Tải lại trạng thái</button>}
      </header>
      {status === undefined && !statusError && <p role="status">Đang tải trạng thái…</p>}
      {statusError && <p className="admin-notice error" role="alert">Không thể tải trạng thái buổi diễn.</p>}
      {status && <div className="event-disruption-status">
        <div aria-live="polite">
          <h3>{disruptionStates[status.state]}</h3>
          <p>{status.kind === 'CANCEL' ? 'Hủy buổi diễn' : 'Hoãn buổi diễn'} · {status.reason}</p>
          {status.eventDate && <p>Lịch diễn mới <time dateTime={status.eventDate}>{dateTime.format(new Date(status.eventDate))}</time></p>}
          <ul className="concert-readiness-list">
            <li className={status.ticketingReady ? 'done' : ''}>
              {status.ticketingReady ? 'Ticketing đã xác nhận' : 'Đang chờ Ticketing xác nhận'}
            </li>
            <li className={status.checkinReady ? 'done' : ''}>
              {status.checkinReady ? 'Check-in đã xác nhận' : 'Đang chờ Check-in xác nhận'}
            </li>
          </ul>
        </div>
        {status.kind === 'POSTPONE' && phase === 'PAUSED' && <button type="button" className="admin-primary-action"
          disabled={busy || conflict || statusError}
          onClick={() => {
            setPendingResume(true);
            void send(() => resumeDisruption(concertId, status.id));
          }}>Mở lại bán vé và check-in</button>}
      </div>}
      {!operationsAllowed && status === null && <p>Buổi diễn chưa ở trạng thái có thể hoãn hoặc hủy.</p>}

      {showImpact && <section className="event-disruption-impact" aria-labelledby="event-disruption-impact-title">
        <header className="event-disruption-heading">
          <h3 id="event-disruption-impact-title">Đơn hàng bị ảnh hưởng{impact ? ` (${impact.totalElements})` : ''}</h3>
          <button type="button" className="admin-secondary-action" disabled={impactLoading}
            onClick={() => refreshImpact()}>{impactError ? 'Tải lại danh sách' : 'Cập nhật danh sách'}</button>
        </header>
        {impactLoading && <p role="status">Đang tải danh sách…</p>}
        {impactError && <p className="admin-notice error" role="alert">Không thể tải danh sách đơn hàng bị ảnh hưởng.</p>}
        {!impactLoading && !impactError && impact && (impact.content.length ? (
          <ul className="event-disruption-orders">
            {impact.content.map((order) => <li key={order.orderId}>
              <Link to={`/admin/orders?${new URLSearchParams({ orderId: order.orderId })}`}>{order.orderId}</Link>
              <span>{orderStates[order.status] ?? order.status}
                {order.paymentState && <> · {paymentStates[order.paymentState] ?? order.paymentState}</>}
              </span>
              <span>{money.format(order.amount)}{order.casePrepared && ' · Đã tạo hồ sơ'}</span>
            </li>)}
          </ul>
        ) : <p>Không có đơn hàng bị ảnh hưởng.</p>)}
        {impact && impact.totalPages > 1 && !impactError && <nav className="admin-pagination" aria-label="Phân trang đơn hàng bị ảnh hưởng">
          <span>Trang {page + 1} / {impact.totalPages}</span>
          <div>
            <button type="button" aria-disabled={impactLoading || page === 0}
              onClick={() => !impactLoading && page > 0 && refreshImpact(page - 1)}>Trang trước</button>
            <button type="button" aria-disabled={impactLoading || page + 1 >= impact.totalPages}
              onClick={() => !impactLoading && page + 1 < impact.totalPages && refreshImpact(page + 1)}>Trang sau</button>
          </div>
        </nav>}
      </section>}

      {commandError && !accepted && <div className="admin-notice error" role="alert"><p>{commandError}</p></div>}
      {showForm && <form className="event-disruption-form" onSubmit={(event) => void submit(event)}>
        <label className="admin-field">
          <span>Quyết định</span>
          <select value={kind} disabled={busy || !!pendingCommand} onChange={(event) => selectKind(event.target.value as DisruptionKind | '')}>
            <option value="">Chọn thao tác</option>
            <option value="POSTPONE">Hoãn buổi diễn</option>
            <option value="CANCEL">Hủy buổi diễn</option>
          </select>
        </label>
        {kind && <>
          <label className="admin-field"><span>Lý do</span>
            <textarea required maxLength={1000} value={reason} readOnly={busy || !!pendingCommand}
              onChange={(event) => { setReason(event.target.value); setConfirmed(false); }} />
          </label>
          {kind === 'POSTPONE' && <fieldset className="event-disruption-schedule">
            <legend>Lịch mới (giờ Việt Nam)</legend>
            {scheduleFields.map(({ name, label, required }) => <label key={name} className="admin-field">
              <span>{label}</span>
              <input type="datetime-local" value={schedule[name]} required={required} readOnly={busy || !!pendingCommand}
                onChange={(event) => { setSchedule({ ...schedule, [name]: event.target.value }); setConfirmed(false); }} />
            </label>)}
          </fieldset>}
          <label className="event-disruption-confirm">
            <input type="checkbox" checked={confirmed} disabled={busy || !!pendingCommand}
              onChange={(event) => setConfirmed(event.target.checked)} />
            <span>Tôi xác nhận {kind === 'CANCEL' ? 'hủy' : 'hoãn'} buổi diễn và dừng bán vé, check-in trực tuyến.</span>
          </label>
          <button type="submit" className={kind === 'CANCEL' ? 'admin-danger-action' : 'admin-primary-action'}
            disabled={!confirmed || !reason.trim() || !scheduleReady || !impact || impactLoading || impactError || busy || statusError || conflict}>
            {kind === 'CANCEL' ? 'Xác nhận hủy' : 'Xác nhận hoãn'}
          </button>
        </>}
      </form>}
    </section>
  );
}
