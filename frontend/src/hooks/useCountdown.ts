import { useEffect, useMemo, useState } from 'react';

export type Countdown = {
  remainingMs: number;
  remainingSeconds: number;
  hours: number;
  /** Minutes within the current hour when hours > 0, otherwise the total minutes. */
  minutes: number;
  seconds: number;
  formatted: string;
  isWarning: boolean;
  isExpired: boolean;
};

function remainingUntil(expiresAt?: string | null) {
  if (!expiresAt) return null;
  const target = new Date(expiresAt).getTime();
  if (Number.isNaN(target)) return null;
  return Math.max(0, target - Date.now());
}

const pad = (value: number) => value.toString().padStart(2, '0');

/** mm:ss below one hour, h:mm:ss from one hour. */
export function formatCountdown(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3_600);
  const minutes = Math.floor((safe % 3_600) / 60);
  const seconds = safe % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export function useCountdown(expiresAt?: string | null, warningThresholdSeconds = 120): Countdown {
  const [countdownState, setCountdownState] = useState(() => ({
    expiresAt: expiresAt ?? null,
    remainingMs: remainingUntil(expiresAt) ?? 0,
  }));

  useEffect(() => {
    const activeExpiry = expiresAt ?? null;
    const tick = () =>
      setCountdownState({
        expiresAt: activeExpiry,
        remainingMs: remainingUntil(expiresAt) ?? 0,
      });
    tick();
    if (!expiresAt) return undefined;

    const intervalId = window.setInterval(tick, 1_000);
    return () => window.clearInterval(intervalId);
  }, [expiresAt]);

  return useMemo(() => {
    // A newly created order reaches this hook one render after its expiry value.
    // Do not report it as expired until the local countdown has synchronized to that value.
    const hasExpiry = Boolean(expiresAt) && countdownState.expiresAt === expiresAt;
    const remainingMs = hasExpiry ? countdownState.remainingMs : 0;
    const remainingSeconds = hasExpiry ? Math.ceil(remainingMs / 1_000) : 0;
    const hours = Math.floor(remainingSeconds / 3_600);
    const minutes = Math.floor((remainingSeconds % 3_600) / 60);
    const seconds = remainingSeconds % 60;

    return {
      remainingMs,
      remainingSeconds,
      hours,
      minutes,
      seconds,
      formatted: formatCountdown(remainingSeconds),
      isWarning: hasExpiry && remainingSeconds > 0 && remainingSeconds <= warningThresholdSeconds,
      isExpired: hasExpiry && remainingMs <= 0,
    };
  }, [countdownState, expiresAt, warningThresholdSeconds]);
}
