import { useEffect, useRef } from 'react';

/** Runs `onDue` once when the ISO instant passes; a null instant schedules nothing. */
export function useDeadline(at: string | null | undefined, onDue: () => void) {
  const callback = useRef(onDue);
  useEffect(() => {
    callback.current = onDue;
  });
  useEffect(() => {
    const time = at ? Date.parse(at) : NaN;
    if (!Number.isFinite(time)) return;
    const timer = window.setTimeout(() => callback.current(), Math.max(0, time - Date.now()));
    return () => window.clearTimeout(timer);
  }, [at]);
}
