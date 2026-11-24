import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { Client, type IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiClientError, apiBaseUrl, isRequestCanceled } from '../../api/client';
import { getConcert, type ConcertDetail } from '../../api/concerts';
import { eventPath, getEventPerformance, performancePath } from '../../api/performances';
import { concertTitle } from '../../features/concert/concertText';
import { getAuthToken } from '../../features/auth/tokenCookie';
import {
  clearStoredQueueAdmission,
  joinQueue,
  getQueueStatus,
  leaveQueue,
  storeQueueAdmission,
  type QueueStatusResponse,
} from '../../api/queue';
import { dateFormatter, numberFormatter } from '../../data/formatters';
import { useCountdown } from '../../hooks/useCountdown';
import './WaitingRoomPage.css';

const eventDateTime = dateFormatter({ dateStyle: 'medium', timeStyle: 'short' });
const counts = numberFormatter({ maximumFractionDigits: 0 });
type QueueEvent = Pick<
  ConcertDetail,
  'title' | 'translations' | 'eventDate' | 'venueName' | 'saleStartAt'
>;

const queueTitles = {
  WAITING_ROOM: 'waitingRoomPage_banDaOTrongPhongChoAn',
  WAITING: 'waitingRoomPage_banDangXepHang',
  ADMITTED: 'waitingRoomPage_admitted',
  EXPIRED: 'waitingRoomPage_phienHangChoCuaBanDaKet',
  LEFT: 'waitingRoomPage_phienHangChoCuaBanDaKet',
} as const;
const queueProblems = {
  preparing: 'waitingRoomPage_hangChoDangChuanBiDangThu',
  unavailable: 'waitingRoomPage_queueUnavailable',
  rateLimit: 'waitingRoomPage_coQuaNhieuYeuCauHangCho',
  joinFailed: 'waitingRoomPage_khongTheTruyCapPhongChoVui',
  pollFailed: 'waitingRoomPage_statusRetry',
  admissionUnconfirmed: 'waitingRoomPage_admissionUnconfirmed',
} as const;

function queueUnavailable(error: unknown) {
  return error instanceof ApiClientError && [400, 403, 404, 409, 410].includes(error.status);
}

export function WaitingRoomPage() {
  const { t } = useTranslation('customer');
  const { id, eventId } = useParams();
  const navigate = useNavigate();
  const [eventDetails, setEventDetails] = useState<QueueEvent | null>(null);
  const [detailsFailed, setDetailsFailed] = useState(false);
  const [queueStatus, setQueueStatus] = useState<QueueStatusResponse | null>(null);
  const [joining, setJoining] = useState(true);
  const [interrupted, setInterrupted] = useState(false);
  const [problem, setProblem] = useState<keyof typeof queueProblems | null>(null);
  const [retry, setRetry] = useState(0);
  const [leavingConcert, setLeavingConcert] = useState<string | null>(null);
  const leaving = leavingConcert === id;
  const leavingRef = useRef(false);
  const stopWaitingRef = useRef<(() => void) | null>(null);
  const detailsPath = eventId
    ? eventPath(eventId)
    : id
      ? '/concerts/' + encodeURIComponent(id)
      : '/';
  const seatsPath =
    eventId && id ? performancePath(eventId, id) + '/seats' : detailsPath + '/seats';

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    const { signal } = controller;
    const detail = eventId
      ? getEventPerformance(eventId, id, signal).then(({ event, performance }) => ({
          title: event.title,
          eventDate: performance.startsAt,
          venueName: performance.venueName,
          saleStartAt: performance.saleStartAt,
        }))
      : getConcert(id, signal);
    void detail
      .then((result) => {
        if (!signal.aborted) setEventDetails(result);
      })
      .catch((error: unknown) => {
        if (!signal.aborted && !isRequestCanceled(error)) setDetailsFailed(true);
      });
    return () => controller.abort();
  }, [eventId, id]);

  useEffect(() => {
    if (!id) return;
    const concertId = id;
    leavingRef.current = false;
    const controller = new AbortController();
    const { signal } = controller;
    let finished = false;
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
      if (!signal.aborted && !finished && !leavingRef.current) {
        const delay =
          pollAfterMs == null
            ? 12_000 + Math.random() * 3_000
            : pollAfterMs * (0.8 + Math.random() * 0.4);
        refreshTimer = window.setTimeout(refreshStatus, delay);
      }
    }

    function handleStatus(nextStatus: QueueStatusResponse) {
      if (signal.aborted || finished || leavingRef.current) return;
      if (nextStatus.status === 'ADMITTED') {
        const expiry = nextStatus.sessionExpiresAt ? Date.parse(nextStatus.sessionExpiresAt) : NaN;
        if (
          !Number.isFinite(expiry) ||
          expiry <= Date.now() ||
          !storeQueueAdmission(concertId, nextStatus)
        ) {
          setProblem('admissionUnconfirmed');
          return;
        }
        finished = true;
        stopWaiting();
        setQueueStatus(nextStatus);
        setProblem(null);
        navigate(seatsPath, { replace: true });
        return;
      }

      if (nextStatus.status === 'EXPIRED' || nextStatus.status === 'LEFT') {
        finished = true;
        stopWaiting();
      } else {
        pollAfterMs = nextStatus.pollAfterMs;
        const nearFront =
          nextStatus.status === 'WAITING' &&
          nextStatus.position != null &&
          nextStatus.position <= 1_000;
        if (pollAfterMs == null || nearFront) connectRealtime();
        else {
          stopRealtime();
          setInterrupted(false);
        }
      }
      setQueueStatus(nextStatus);
      setProblem(null);
      setJoining(false);
    }

    async function refreshStatus() {
      if (signal.aborted || finished || requestInProgress || leavingRef.current) return;
      requestInProgress = true;
      try {
        handleStatus(await getQueueStatus(concertId, signal));
      } catch (error) {
        if (!signal.aborted && !isRequestCanceled(error) && !leavingRef.current) {
          finished = queueUnavailable(error);
          if (finished) stopWaiting();
          setProblem(finished ? 'unavailable' : 'pollFailed');
          setJoining(false);
        }
      } finally {
        requestInProgress = false;
        scheduleRefresh();
      }
    }

    async function join() {
      if (signal.aborted || leavingRef.current) return;
      clearStoredQueueAdmission();
      setJoining(true);
      setProblem(null);
      setInterrupted(false);

      try {
        handleStatus(await joinQueue(concertId, signal));
        scheduleRefresh();
      } catch (error) {
        if (signal.aborted || isRequestCanceled(error) || leavingRef.current) return;
        if (
          error instanceof ApiClientError &&
          [429, 503].includes(error.status) &&
          joinAttempts < 6
        ) {
          const delay = Math.min(5_000, 1_000 * 2 ** joinAttempts++) + Math.random() * 500;
          setProblem('preparing');
          joinRetryTimer = window.setTimeout(join, delay);
          return;
        }
        setJoining(false);
        setProblem(
          queueUnavailable(error)
            ? 'unavailable'
            : error instanceof ApiClientError && error.status === 429
              ? 'rateLimit'
              : 'joinFailed',
        );
      }
    }

    function connectRealtime() {
      if (stompClient) return;
      const token = getAuthToken();
      if (!token) return;

      function onInterrupted() {
        if (!signal.aborted && !finished && !leavingRef.current && stompClient === client) {
          setInterrupted(true);
        }
      }

      const client = new Client({
        webSocketFactory: () => new SockJS(apiBaseUrl + '/ws'),
        connectHeaders: { Authorization: 'Bearer ' + token },
        reconnectDelay: 5_000 + Math.random() * 5_000,
        heartbeatIncoming: 10_000,
        heartbeatOutgoing: 10_000,
        onConnect: () => {
          if (signal.aborted || finished || leavingRef.current || stompClient !== client) return;
          setInterrupted(false);
          if (pollAfterMs == null) {
            window.clearTimeout(refreshTimer);
            void refreshStatus();
          }
          client.subscribe('/user/queue/concerts/' + concertId, (message: IMessage) => {
            if (signal.aborted || finished || leavingRef.current || stompClient !== client) return;
            try {
              handleStatus(JSON.parse(message.body) as QueueStatusResponse);
              setInterrupted(false);
            } catch {
              onInterrupted();
            }
          });
          client.publish({
            destination: '/app/queue/subscribe',
            body: JSON.stringify({ concertId }),
          });
        },
        onStompError: onInterrupted,
        onWebSocketClose: onInterrupted,
      });
      stompClient = client;
      client.activate();
    }

    void join();
    return () => {
      stopWaiting();
      if (stopWaitingRef.current === stopWaiting) stopWaitingRef.current = null;
    };
  }, [id, navigate, retry, seatsPath]);

  async function leave() {
    const stopWaiting = stopWaitingRef.current;
    if (!id || leavingRef.current || !stopWaiting) return;
    leavingRef.current = true;
    setLeavingConcert(id);
    stopWaiting();
    try {
      await leaveQueue(id);
    } catch {
      // The user can still return to the event if leaving could not be confirmed.
    }
    if (stopWaitingRef.current !== stopWaiting) return;
    clearStoredQueueAdmission();
    navigate(detailsPath);
  }

  const inRoom = queueStatus?.status === 'WAITING_ROOM';
  const inQueue = queueStatus?.status === 'WAITING';
  const admitted = queueStatus?.status === 'ADMITTED';
  const expired = queueStatus?.status === 'EXPIRED' || queueStatus?.status === 'LEFT';
  const unavailable = problem === 'unavailable';
  const canRetry = problem === 'joinFailed' || problem === 'rateLimit';
  const saleStartAt = eventDetails?.saleStartAt;
  const roomOpensAt =
    saleStartAt && Number.isFinite(Date.parse(saleStartAt)) ? saleStartAt : undefined;
  const peopleAhead = queueStatus?.peopleAhead;
  const position = peopleAhead ?? queueStatus?.position;
  const estimate = queueStatus?.estimatedWaitSeconds;
  const minutes = estimate != null && estimate >= 0 ? Math.ceil(estimate / 60) : null;
  const title = unavailable
    ? 'waitingRoomPage_hangChoDaDong'
    : queueStatus
      ? queueTitles[queueStatus.status]
      : canRetry
        ? 'waitingRoomPage_joinFailed'
        : 'waitingRoomPage_dangChuanBiViTriCuaBan';

  return (
    <div className="buyer-page purchase-page page-width waiting-purchase-page">
      <header className="purchase-header">
        <div>
          <h1>
            {eventDetails ? concertTitle(eventDetails) : t('customer:waitingRoomPage_hangChoMuaVe')}
          </h1>
          {eventDetails ? (
            <p>
              <time dateTime={eventDetails.eventDate}>
                {eventDateTime.format(new Date(eventDetails.eventDate))}
              </time>{' '}
              · {eventDetails.venueName}
            </p>
          ) : detailsFailed ? (
            <p>{t('customer:waitingRoomPage_khongTheTaiThongTinBuoiBieu')}</p>
          ) : null}
        </div>
        {(inRoom || inQueue) && !unavailable ? (
          <p className="purchase-step" aria-current="step">
            {t(inRoom ? 'waitingRoomPage_phongCho' : 'waitingRoomPage_hangCho')}
          </p>
        ) : null}
      </header>

      <section
        className="purchase-panel waiting-purchase-panel"
        aria-labelledby="waiting-purchase-title"
      >
        <div aria-live="polite">
          <h2 id="waiting-purchase-title">{t(title)}</h2>
        </div>

        {expired || unavailable ? (
          <>
            <p>
              {t(
                expired
                  ? 'waitingRoomPage_hayThamGiaLaiDeYeuCau'
                  : 'waitingRoomPage_queueUnavailable',
              )}
            </p>
            <Link className="button button-primary" to={detailsPath}>
              {t('customer:waitingRoomPage_backToEvent')}
            </Link>
          </>
        ) : null}

        {inRoom && !unavailable ? (
          <>
            {roomOpensAt ? <OpeningCountdown opensAt={roomOpensAt} /> : null}
            <p>{t('customer:waitingRoomPage_viTriCuaBanSeDuocPhan')}</p>
          </>
        ) : null}

        {inQueue && !unavailable ? (
          <>
            {position != null ? (
              <dl className="waiting-queue-position">
                <dt>
                  {t(
                    peopleAhead != null
                      ? 'waitingRoomPage_nguoiPhiaTruoc'
                      : 'waitingRoomPage_viTri',
                  )}
                </dt>
                <dd>{counts.format(position)}</dd>
              </dl>
            ) : null}
            {minutes === null ? (
              <p>{t('customer:waitingRoomPage_noEstimate')}</p>
            ) : (
              <p>
                {t('customer:waitingRoomPage_estimate', {
                  duration: t(
                    minutes <= 1 ? 'waitingRoomPage_khoang1Phut' : 'waitingRoomPage_khoangPhut',
                    {
                      arg1: counts.format(minutes),
                    },
                  ),
                })}
              </p>
            )}
          </>
        ) : null}

        {!expired && !unavailable && (problem || interrupted) ? (
          <p className="waiting-purchase-feedback" role={canRetry ? 'alert' : 'status'}>
            {t(problem ? queueProblems[problem] : 'waitingRoomPage_liveFallback')}
          </p>
        ) : null}

        {canRetry ? (
          <button
            className="button button-primary"
            type="button"
            onClick={() => setRetry((key) => key + 1)}
          >
            {t('customer:waitingRoomPage_tryAgain')}
          </button>
        ) : null}

        {!expired && !unavailable && (joining || inQueue || inRoom) ? (
          <p className="waiting-purchase-help">
            {t('customer:waitingRoomPage_hayGiuTabNayMoTrongKhi')}
          </p>
        ) : null}
      </section>

      {canRetry ? (
        <Link className="button button-secondary waiting-leave-action" to={detailsPath}>
          {t('customer:waitingRoomPage_backToEvent')}
        </Link>
      ) : !expired && !unavailable && !admitted ? (
        <button
          className="button button-secondary waiting-leave-action"
          type="button"
          disabled={leaving}
          onClick={() => void leave()}
        >
          {t(leaving ? 'waitingRoomPage_leaving' : 'waitingRoomPage_leaveQueue')}
        </button>
      ) : null}
    </div>
  );
}

function OpeningCountdown({ opensAt }: { opensAt: string }) {
  const { t } = useTranslation('customer');
  const countdown = useCountdown(opensAt);
  if (countdown.isExpired) return <p>{t('customer:waitingRoomPage_waitForQueue')}</p>;

  return (
    <p className="purchase-deadline waiting-opening-countdown">
      <span>{t('customer:waitingRoomPage_moBanVeSau')}</span>
      <strong role="timer" aria-label={t('customer:waitingRoomPage_moBanVeSau')}>
        {countdown.formatted}
      </strong>
    </p>
  );
}
