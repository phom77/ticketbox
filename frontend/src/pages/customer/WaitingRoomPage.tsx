import { useEffect, useMemo, useState } from 'react';
import { Client, type IMessage, type StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiClientError, apiBaseUrl, isRequestCanceled } from '../../api/client';
import { getConcert, type ConcertDetail } from '../../api/concerts';
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
  const { id } = useParams();
  const navigate = useNavigate();
  const [concert, setConcert] = useState<ConcertDetail | null>(null);
  const [queueStatus, setQueueStatus] = useState<QueueStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    let active = true;

    setLoading(true);
    getConcert(id, controller.signal)
      .then((detail) => {
        if (active) setConcert(detail);
      })
      .catch((requestError) => {
        if (active && !isRequestCanceled(requestError))
          setError('Không thể tải thông tin buổi biểu diễn này.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const concertId = id;
    const controller = new AbortController();
    let active = true;
    let stompClient: Client | null = null;
    let subscription: StompSubscription | null = null;
    let snapshotSubscription: StompSubscription | null = null;
    let refreshTimer: number | undefined;
    let requestInProgress = false;
    let hasAdmission = false;
    let joinRetryTimer: number | undefined;
    let joinAttempts = 0;

    async function refreshStatus() {
      if (!active || requestInProgress) return;
      requestInProgress = true;
      try {
        handleStatus(await getQueueStatus(concertId, controller.signal));
      } catch (requestError) {
        if (active && !isRequestCanceled(requestError)) setError(messageForQueueError(requestError));
      } finally {
        requestInProgress = false;
        if (active) refreshTimer = window.setTimeout(refreshStatus, 12_000 + Math.random() * 3_000);
      }
    }

    function handleStatus(nextStatus: QueueStatusResponse) {
      if (!active || (hasAdmission && nextStatus.status !== 'ADMITTED')) return;
      if (nextStatus.status === 'ADMITTED') hasAdmission = true;
      setQueueStatus(nextStatus);
      setError(null);
      setJoining(false);

      if (nextStatus.status === 'ADMITTED') {
        const admission = storeQueueAdmission(concertId, nextStatus);
        if (admission) {
          navigate(`/concerts/${concertId}/seats`, { replace: true });
        }
      }
    }

    async function join() {
      clearStoredQueueAdmission();
      setJoining(true);
      setError(null);

      try {
        const joined = await joinQueue(concertId, controller.signal);
        handleStatus(joined);
        if (
          joined.status !== 'ADMITTED' &&
          joined.status !== 'EXPIRED' &&
          joined.status !== 'LEFT'
        ) {
          connectRealtime();
          refreshTimer = window.setTimeout(refreshStatus, 12_000 + Math.random() * 3_000);
        }
      } catch (requestError) {
        if (active && !isRequestCanceled(requestError)) {
          if (requestError instanceof ApiClientError && [429, 503].includes(requestError.status) && joinAttempts < 6) {
            const delay = Math.min(5_000, 1_000 * 2 ** joinAttempts++) + Math.random() * 500;
            setError('Hàng chờ đang chuẩn bị. Đang thử kết nối lại...');
            joinRetryTimer = window.setTimeout(join, delay);
            return;
          }
          setJoining(false);
          setError(messageForQueueError(requestError));
        }
      }
    }

    function connectRealtime() {
      const token = getAuthToken();
      if (!token || !active) return;

      stompClient = new Client({
        webSocketFactory: () => new SockJS(`${apiBaseUrl}/ws`),
        connectHeaders: { Authorization: `Bearer ${token}` },
        reconnectDelay: 5_000 + Math.random() * 5_000,
        heartbeatIncoming: 10_000,
        heartbeatOutgoing: 10_000,
        onConnect: () => {
          if (!active || !stompClient) return;
          window.clearTimeout(refreshTimer);
          void refreshStatus();
          snapshotSubscription = stompClient.subscribe(`/topic/queue/concerts/${concertId}`, (message: IMessage) => {
            try {
              const snapshot = JSON.parse(message.body) as Pick<QueueStatusResponse, 'waitingRoomCount' | 'queueSize' | 'activeShoppers'>;
              if (active) setQueueStatus((previous) => previous && previous.status !== 'ADMITTED'
                ? { ...previous, waitingRoomCount: snapshot.waitingRoomCount, queueSize: snapshot.queueSize, activeShoppers: snapshot.activeShoppers }
                : previous);
            } catch { /* A private status refresh repairs a missed snapshot. */ }
          });
          subscription = stompClient.subscribe(
            `/user/queue/concerts/${concertId}`,
            (message: IMessage) => {
              try {
                handleStatus(JSON.parse(message.body) as QueueStatusResponse);
              } catch {
                setError('Không đọc được cập nhật hàng chờ trực tiếp. Đang kết nối lại...');
              }
            },
          );
          stompClient.publish({
            destination: '/app/queue/subscribe',
            body: JSON.stringify({ concertId }),
          });
        },
        onStompError: () => {
          if (active) setError('Kết nối hàng chờ trực tiếp bị gián đoạn. Đang kết nối lại...');
        },
        onWebSocketClose: () => {
          if (active) setError('Kết nối hàng chờ trực tiếp bị gián đoạn. Đang kết nối lại...');
        },
      });
      stompClient.activate();
    }

    void join();

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(refreshTimer);
      window.clearTimeout(joinRetryTimer);
      snapshotSubscription?.unsubscribe();
      subscription?.unsubscribe();
      void stompClient?.deactivate();
    };
  }, [id, navigate]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const waitLabel = useMemo(() => {
    if (!queueStatus?.estimatedWaitSeconds) return 'Đang tính';
    const minutes = Math.max(1, Math.ceil(queueStatus.estimatedWaitSeconds / 60));
    return minutes === 1 ? 'Khoảng 1 phút' : `Khoảng ${minutes} phút`;
  }, [queueStatus]);

  async function leave() {
    if (id) {
      try {
        await leaveQueue(id);
      } catch {
        // Leaving is best-effort; route change should not be blocked by a network miss.
      }
    }
    clearStoredQueueAdmission();
    navigate(id ? `/concerts/${id}` : '/');
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
          {'<'} Chi tiết sự kiện
        </button>
        <div className="flow-steps" aria-label="Tiến trình đặt vé">
          <span className={`flow-step${isWaitingRoom ? ' active' : ''}`}>
            <b>1</b><i>Phòng chờ</i>
          </span>
          <b className="flow-step-connector" />
          <span className={`flow-step${isWaiting ? ' active' : ''}`}>
            <b>2</b><i>Hàng chờ</i>
          </span>
          <b className="flow-step-connector" />
          <span className="flow-step">
            <b>3</b><i>Vé</i>
          </span>
          <b className="flow-step-connector" />
          <span className="flow-step">
            <b>4</b><i>Thanh toán</i>
          </span>
        </div>
        <div className="timer" role="status">
          {isWaitingRoom
            ? `Mở bán sau ${countdown(concert?.saleStartAt, now)}`
            : 'Hàng chờ trực tiếp'}
        </div>
      </div>

      <section className="waiting-room-shell">
        <div className="waiting-room-panel" aria-live="polite">
          <div className="waiting-room-event">
            <span>{isWaitingRoom ? 'Phòng chờ' : 'Hàng chờ mua vé'}</span>
            <strong>{concert?.title ?? 'Phòng chờ'}</strong>
            <p>
              {concert
                ? `${eventDate.format(new Date(concert.eventDate))} / ${concert.venueName}`
                : 'Vui lòng giữ vị trí của bạn trong khi TicketBox duyệt người mua theo thứ tự.'}
            </p>
          </div>

          {isWaitingRoom ? (
            <div
              className="waiting-room-countdown"
              role="timer"
              aria-label={`Mở bán sau ${countdown(concert?.saleStartAt, now)}`}
            >
              <span>Mở bán vé sau</span>
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
                ? 'Đang vào phòng chờ'
                : isWaitingRoom
                  ? 'Bạn đã ở trong phòng chờ an toàn'
                  : isWaiting
                    ? 'Bạn đang xếp hàng'
                    : isClosed
                      ? 'Hàng chờ đã đóng'
                      : 'Đang kiểm tra quyền truy cập'}
            </span>
            <h2>
              {isWaitingRoom
                ? 'Vị trí của bạn sẽ được phân tự động'
                : isWaiting
                  ? `${peopleAhead} người phía trước bạn`
                  : isClosed
                    ? 'Phiên hàng chờ của bạn đã kết thúc'
                    : 'Đang chuẩn bị vị trí của bạn'}
            </h2>
            <p>
              {isWaitingRoom
                ? `${waitingRoomCount} người đang ở trong phòng chờ. Khi mở bán, TicketBox sẽ chụp trạng thái phòng một lần, phân vị trí hàng chờ ngẫu nhiên rồi tự động chuyển mọi người sang hàng chờ.`
                : isWaiting
                  ? peopleAhead === 0
                    ? `Bạn đang đứng đầu hàng chờ. ${activeShoppers > 0 ? 'Một lượt chọn vé đang được sử dụng; bạn sẽ được chuyển vào tự động khi lượt đó mở.' : 'Chúng tôi đang chuẩn bị lượt chọn vé cho bạn.'}`
                    : `Thời gian chờ dự kiến: ${waitLabel}. Trang này sẽ tự động chuyển bạn sang bước tiếp theo.`
                  : isClosed
                    ? 'Hãy tham gia lại để yêu cầu phiên mua vé mới cho concert này.'
                    : 'Hãy giữ tab này mở trong khi chúng tôi xác nhận phiên mua vé của bạn.'}
            </p>
          </div>

          {error ? (
            <div className="waiting-room-error" role="alert">
              {error}
            </div>
          ) : null}

          <div className="queue-metrics">
            <div>
              <span>{isWaitingRoom ? 'Mở bán sau' : 'Vị trí'}</span>
              <strong>{isWaitingRoom ? countdown(concert?.saleStartAt, now) : position}</strong>
            </div>
            <div>
              <span>{isWaitingRoom ? 'Trong phòng chờ' : 'Người phía trước'}</span>
              <strong>{isWaitingRoom ? waitingRoomCount : peopleAhead}</strong>
            </div>
            <div>
              <span>{isWaitingRoom ? 'Phân vị trí' : 'Đang chờ'}</span>
              <strong>{isWaitingRoom ? 'Ngẫu nhiên khi mở bán' : queueSize}</strong>
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
    return 'Có quá nhiều yêu cầu hàng chờ. Vui lòng đợi một chút trước khi thử lại.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Không thể truy cập phòng chờ. Vui lòng thử lại.';
}
