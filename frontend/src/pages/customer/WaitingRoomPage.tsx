import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { concertTitle } from '../../features/concert/concertText';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Client, type IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiClientError, apiBaseUrl, isRequestCanceled } from '../../api/client';
import { getConcert, type ConcertDetail } from '../../api/concerts';
import { eventPath, getEventPerformance, performancePath } from '../../api/performances';
import { getAuthToken } from '../../features/auth/tokenCookie';
import {
  clearStoredQueueAdmission,
  joinQueue,
  getQueueStatus,
  leaveQueue,
  storeQueueAdmission,
  type QueueStatusResponse,
} from '../../api/queue';
import { eventDate } from '../../data/formatters';

export function WaitingRoomPage() {
  useTranslation();
  const { id, eventId } = useParams();
  const navigate = useNavigate();
  const [concert, setConcert] = useState<Pick<ConcertDetail, 'id' | 'title' | 'translations' | 'eventDate' | 'venueName' | 'saleStartAt'> | null>(null);
  const [queueStatus, setQueueStatus] = useState<QueueStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const readyForQueue = !eventId || concert?.id === id;
  const stopWaitingRef = useRef<(() => void) | null>(null);
  const leavingRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    let active = true;

    setLoading(true);
    const details = eventId
      ? getEventPerformance(eventId, id, controller.signal).then(({ event, performance }) => ({
        id: performance.id, title: event.title, eventDate: performance.startsAt,
        venueName: performance.venueName, saleStartAt: performance.saleStartAt,
      }))
      : getConcert(id, controller.signal);
    details
      .then((detail) => {
        if (active) setConcert(detail);
      })
      .catch((requestError) => {
        if (active && !isRequestCanceled(requestError))
          setError(translate("customer:waitingRoomPage_khongTheTaiThongTinBuoiBieu"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [eventId, id]);

  useEffect(() => {
    if (!id || !readyForQueue) return;
    const concertId = id;
    const controller = new AbortController();
    const { signal } = controller;
    leavingRef.current = false;
    let stompClient: Client | null = null;
    let refreshTimer: number | undefined;
    let requestInProgress = false;
    let joinRetryTimer: number | undefined;
    let joinAttempts = 0;
    let pollAfterMs: number | undefined;

    function stopRealtime() {
      const client = stompClient;
      stompClient = null;
      void client?.deactivate();
    }

    function stopWaiting() {
      controller.abort();
      window.clearTimeout(refreshTimer);
      window.clearTimeout(joinRetryTimer);
      stopRealtime();
    }

    stopWaitingRef.current = stopWaiting;

    function scheduleRefresh() {
      window.clearTimeout(refreshTimer);
      if (signal.aborted) return;
      const delay = pollAfterMs == null
        ? 12_000 + Math.random() * 3_000
        : pollAfterMs * (0.8 + Math.random() * 0.4);
      refreshTimer = window.setTimeout(refreshStatus, delay);
    }

    async function refreshStatus() {
      if (signal.aborted || requestInProgress) return;
      requestInProgress = true;
      try {
        handleStatus(await getQueueStatus(concertId, signal));
      } catch (requestError) {
        if (!signal.aborted && !isRequestCanceled(requestError)) {
          setError(messageForQueueError(requestError));
        }
      } finally {
        requestInProgress = false;
        scheduleRefresh();
      }
    }

    function handleStatus(nextStatus: QueueStatusResponse) {
      if (signal.aborted) return;
      if (nextStatus.status === 'ADMITTED') {
        const expiry = nextStatus.sessionExpiresAt ? Date.parse(nextStatus.sessionExpiresAt) : NaN;
        if (!Number.isFinite(expiry) || expiry <= Date.now() || !storeQueueAdmission(concertId, nextStatus)) {
          return;
        }
        stopWaiting();
        navigate((eventId ? performancePath(eventId, concertId) : `/concerts/${concertId}`) + '/seats', { replace: true });
        return;
      }

      if (nextStatus.status === 'EXPIRED' || nextStatus.status === 'LEFT') {
        stopWaiting();
      } else {
        pollAfterMs = nextStatus.pollAfterMs;
        const nearFront = nextStatus.status === 'WAITING'
          && nextStatus.position != null && nextStatus.position <= 1_000;
        if (pollAfterMs == null || nearFront) connectRealtime();
        else stopRealtime();
      }
      setQueueStatus(nextStatus);
      setError(null);
      setJoining(false);
    }

    async function join() {
      if (signal.aborted) return;
      clearStoredQueueAdmission();
      setJoining(true);
      setError(null);

      try {
        handleStatus(await joinQueue(concertId, signal));
        scheduleRefresh();
      } catch (requestError) {
        if (signal.aborted || isRequestCanceled(requestError)) return;
        if (requestError instanceof ApiClientError && [429, 503].includes(requestError.status) && joinAttempts < 6) {
          const delay = Math.min(5_000, 1_000 * 2 ** joinAttempts++) + Math.random() * 500;
          setError(translate("customer:waitingRoomPage_hangChoDangChuanBiDangThu"));
          joinRetryTimer = window.setTimeout(join, delay);
          return;
        }
        setJoining(false);
        setError(messageForQueueError(requestError));
      }
    }

    function connectRealtime() {
      const token = getAuthToken();
      if (!token || signal.aborted || stompClient) return;

      function disconnected() {
        if (!signal.aborted && stompClient === client) {
          setError(translate("customer:waitingRoomPage_ketNoiHangChoTrucTiepBi"));
        }
      }

      const client = new Client({
        webSocketFactory: () => new SockJS(`${apiBaseUrl}/ws`),
        connectHeaders: { Authorization: `Bearer ${token}` },
        reconnectDelay: 5_000 + Math.random() * 5_000,
        heartbeatIncoming: 10_000,
        heartbeatOutgoing: 10_000,
        onConnect: () => {
          if (signal.aborted || stompClient !== client) return;
          if (pollAfterMs == null) {
            window.clearTimeout(refreshTimer);
            void refreshStatus();
            client.subscribe(`/topic/queue/concerts/${concertId}`, (message: IMessage) => {
              if (signal.aborted || stompClient !== client) return;
              try {
                const snapshot = JSON.parse(message.body) as Pick<QueueStatusResponse, 'waitingRoomCount' | 'queueSize' | 'activeShoppers'>;
                setQueueStatus((previous) => previous && previous.status !== 'ADMITTED'
                  ? { ...previous, waitingRoomCount: snapshot.waitingRoomCount, queueSize: snapshot.queueSize, activeShoppers: snapshot.activeShoppers }
                  : previous);
              } catch { /* A private status refresh repairs a missed snapshot. */ }
            });
          }
          client.subscribe(`/user/queue/concerts/${concertId}`, (message: IMessage) => {
            if (signal.aborted || stompClient !== client) return;
            try {
              handleStatus(JSON.parse(message.body) as QueueStatusResponse);
            } catch {
              setError(translate("customer:waitingRoomPage_khongDocDuocCapNhatHangCho"));
            }
          });
          client.publish({
            destination: '/app/queue/subscribe',
            body: JSON.stringify({ concertId }),
          });
        },
        onStompError: disconnected,
        onWebSocketClose: disconnected,
      });
      stompClient = client;
      client.activate();
    }

    void join();
    return () => {
      stopWaiting();
      if (stopWaitingRef.current === stopWaiting) stopWaitingRef.current = null;
    };
  }, [eventId, id, navigate, readyForQueue]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const waitLabel = useMemo(() => {
    if (!queueStatus?.estimatedWaitSeconds) return translate("customer:waitingRoomPage_dangTinh");
    const minutes = Math.max(1, Math.ceil(queueStatus.estimatedWaitSeconds / 60));
    return minutes === 1 ? translate("customer:waitingRoomPage_khoang1Phut") : translate("customer:waitingRoomPage_khoangPhut", { arg1: minutes });
  }, [queueStatus]);

  async function leave() {
    const stopWaiting = stopWaitingRef.current;
    if (!id || leavingRef.current || !stopWaiting) return;
    leavingRef.current = true;
    stopWaiting();
    try {
      await leaveQueue(id);
    } catch {
      // Leaving is best-effort; route change should not be blocked by a network miss.
    }
    if (stopWaitingRef.current !== stopWaiting) return;
    clearStoredQueueAdmission();
    navigate(eventId ? eventPath(eventId) : `/concerts/${id}`);
  }

  if (loading) {
    return (
      <div className="selection-loading page-width">
        <div className="event-skeleton">
          <div />
          <span />
          <span />
        </div>
      </div>
    );
  }

  const isWaiting = queueStatus?.status === 'WAITING';
  const isWaitingRoom = queueStatus?.status === 'WAITING_ROOM';
  const isClosed = queueStatus?.status === 'EXPIRED' || queueStatus?.status === 'LEFT';
  const position = queueStatus?.position ?? '-';
  const peopleAhead = queueStatus?.peopleAhead ?? '-';
  const waitingRoomCount = queueStatus?.waitingRoomCount ?? 0;
  const queueSize = queueStatus?.queueSize ?? 0;
  const activeShoppers = queueStatus?.activeShoppers ?? 0;

  return (
    <div className="waiting-room-page page-width">
      <div className="flow-topbar">
        <button className="back-link" type="button" onClick={() => void leave()}>
          {'<'} {translate("customer:waitingRoomPage_chiTietSuKien")}
        </button>
        <div className="flow-steps" aria-label={translate("customer:waitingRoomPage_tienTrinhDatVe")}>
          <span className={`flow-step${isWaitingRoom ? ' active' : ''}`}>
            <b>1</b><i>{translate("customer:waitingRoomPage_phongCho")}</i>
          </span>
          <b className="flow-step-connector" />
          <span className={`flow-step${isWaiting ? ' active' : ''}`}>
            <b>2</b><i>{translate("customer:waitingRoomPage_hangCho")}</i>
          </span>
          <b className="flow-step-connector" />
          <span className="flow-step">
            <b>3</b><i>{translate("customer:waitingRoomPage_ve")}</i>
          </span>
          <b className="flow-step-connector" />
          <span className="flow-step">
            <b>4</b><i>{translate("customer:waitingRoomPage_thanhToan")}</i>
          </span>
        </div>
        <div className="timer" role="status">
          {isWaitingRoom
            ? translate("customer:waitingRoomPage_moBanSau", { arg1: countdown(concert?.saleStartAt, now) })
            : translate("customer:waitingRoomPage_hangChoTrucTiep")}
        </div>
      </div>

      <section className="waiting-room-shell">
        <div className="waiting-room-panel" aria-live="polite">
          <div className="waiting-room-event">
            <span>{isWaitingRoom ? translate("customer:waitingRoomPage_phongCho") : translate("customer:waitingRoomPage_hangChoMuaVe")}</span>
            <strong>{concert ? concertTitle(concert) : translate("customer:waitingRoomPage_phongCho")}</strong>
            <p>
              {concert
                ? `${eventDate.format(new Date(concert.eventDate))} / ${concert.venueName}`
                : translate("customer:waitingRoomPage_vuiLongGiuViTriCuaBan")}
            </p>
          </div>

          {isWaitingRoom ? (
            <div
              className="waiting-room-countdown"
              role="timer"
              aria-label={translate("customer:waitingRoomPage_moBanSau", { arg1: countdown(concert?.saleStartAt, now) })}
            >
              <span>{translate("customer:waitingRoomPage_moBanVeSau")}</span>
              <strong>{countdown(concert?.saleStartAt, now)}</strong>
            </div>
          ) : (
            <div className={`queue-orbit ${isWaiting ? 'is-waiting' : ''}`} aria-hidden="true">
              <span />
              <strong>{position}</strong>
            </div>
          )}

          <div className="queue-status-copy">
            <span>
              {joining
                ? translate("customer:waitingRoomPage_dangVaoPhongCho")
                : isWaitingRoom
                  ? translate("customer:waitingRoomPage_banDaOTrongPhongChoAn")
                  : isWaiting
                    ? translate("customer:waitingRoomPage_banDangXepHang")
                    : isClosed
                      ? translate("customer:waitingRoomPage_hangChoDaDong")
                      : translate("customer:waitingRoomPage_dangKiemTraQuyenTruyCap")}
            </span>
            <h2>
              {isWaitingRoom
                ? translate("customer:waitingRoomPage_viTriCuaBanSeDuocPhan")
                : isWaiting
                  ? translate("customer:waitingRoomPage_nguoiPhiaTruocBan", { count: peopleAhead })
                  : isClosed
                    ? translate("customer:waitingRoomPage_phienHangChoCuaBanDaKet")
                    : translate("customer:waitingRoomPage_dangChuanBiViTriCuaBan")}
            </h2>
            <p>
              {isWaitingRoom
                ? translate("customer:waitingRoomPage_nguoiDangOTrongPhongChoKhi", { arg1: waitingRoomCount })
                : isWaiting
                  ? peopleAhead === 0
                    ? translate("customer:waitingRoomPage_banDangDungDauHangCho", { arg1: activeShoppers > 0 ? translate("customer:waitingRoomPage_motLuotChonVeDangDuocSu") : translate("customer:waitingRoomPage_chungToiDangChuanBiLuotChon") })
                    : translate("customer:waitingRoomPage_thoiGianChoDuKienTrangNay", { arg1: waitLabel })
                  : isClosed
                    ? translate("customer:waitingRoomPage_hayThamGiaLaiDeYeuCau")
                    : translate("customer:waitingRoomPage_hayGiuTabNayMoTrongKhi")}
            </p>
          </div>

          {error ? (
            <div className="waiting-room-error" role="alert">
              {error}
            </div>
          ) : null}

          <div className="queue-metrics">
            <div>
              <span>{isWaitingRoom ? translate("customer:waitingRoomPage_moBanSau_2") : translate("customer:waitingRoomPage_viTri")}</span>
              <strong>{isWaitingRoom ? countdown(concert?.saleStartAt, now) : position}</strong>
            </div>
            <div>
              <span>{isWaitingRoom ? translate("customer:waitingRoomPage_trongPhongCho") : translate("customer:waitingRoomPage_nguoiPhiaTruoc")}</span>
              <strong>{isWaitingRoom ? waitingRoomCount : peopleAhead}</strong>
            </div>
            <div>
              <span>{isWaitingRoom ? translate("customer:waitingRoomPage_phanViTri") : translate("customer:waitingRoomPage_dangCho")}</span>
              <strong>{isWaitingRoom ? translate("customer:waitingRoomPage_ngauNhienKhiMoBan") : queueSize}</strong>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function countdown(saleStartAt: string | undefined, now: number) {
  if (!saleStartAt) return '--:--:--';
  const remainingSeconds = Math.max(0, Math.ceil((new Date(saleStartAt).getTime() - now) / 1_000));
  const hours = Math.floor(remainingSeconds / 3_600);
  const minutes = Math.floor((remainingSeconds % 3_600) / 60);
  const seconds = remainingSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

function messageForQueueError(error: unknown) {
  if (error instanceof ApiClientError && error.status === 429) {
    return translate("customer:waitingRoomPage_coQuaNhieuYeuCauHangCho");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return translate("customer:waitingRoomPage_khongTheTruyCapPhongChoVui");
}
