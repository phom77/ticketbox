import { useEffect, useMemo, useState } from 'react';

export type Countdown = {
  remainingMs: number;
  remainingSeconds: number;
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

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function useCountdown(expiresAt?: string | null, warningThresholdSeconds = 120): Countdown {
  const [countdownState, setCountdownState] = useState(() => ({
    expiresAt: expiresAt ?? null,
    remainingMs: remainingUntil(expiresAt) ?? 0,
  }));

  useEffect(() => {
    const activeExpiry = expiresAt ?? null;
    const tick = () => setCountdownState({
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
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;

    return {
      remainingMs,
      remainingSeconds,
      minutes,
      seconds,
      formatted: formatCountdown(remainingSeconds),
      isWarning: hasExpiry && remainingSeconds > 0 && remainingSeconds <= warningThresholdSeconds,
      isExpired: hasExpiry && remainingMs <= 0,
    };
  }, [countdownState, expiresAt, warningThresholdSeconds]);
}
