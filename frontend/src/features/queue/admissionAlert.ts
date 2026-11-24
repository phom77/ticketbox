import { useEffect, useState } from 'react';

let audio: AudioContext | null = null;

/** Opt in to a sound and a browser notification. Must run from a click. */
export async function enableAdmissionAlert(): Promise<'on' | 'sound-only'> {
  try {
    const Context =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    audio = Context ? new Context() : null;
    await audio?.resume();
  } catch {
    audio = null;
  }
  if (typeof Notification === 'undefined') return 'sound-only';
  if (Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch {
      return 'sound-only';
    }
  }
  return Notification.permission === 'granted' ? 'on' : 'sound-only';
}

/** Plays a short chime and shows a notification when the tab is in the background. */
export function signalAdmission(title: string, body: string) {
  if (audio) {
    try {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.frequency.value = 880;
      gain.gain.value = 0.15;
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + 0.35);
    } catch {
      // Sound is a courtesy only.
    }
  }
  if (
    typeof Notification !== 'undefined' &&
    Notification.permission === 'granted' &&
    document.hidden
  ) {
    try {
      new Notification(title, { body });
    } catch {
      // Some browsers only allow notifications from a service worker.
    }
  }
}

/** True when another tab of this browser is waiting for the same show. */
export function useDuplicateTab(showId: string | undefined) {
  const [duplicate, setDuplicate] = useState(false);
  useEffect(() => {
    if (!showId || typeof BroadcastChannel === 'undefined') return;
    const tab = Math.random().toString(36).slice(2);
    const channel = new BroadcastChannel('ticketbox-waiting-room');
    channel.onmessage = ({ data }: MessageEvent<{ type: string; show: string; tab: string }>) => {
      if (data?.show !== showId || data.tab === tab) return;
      setDuplicate(true);
      if (data.type === 'hello') channel.postMessage({ type: 'present', show: showId, tab });
    };
    channel.postMessage({ type: 'hello', show: showId, tab });
    return () => channel.close();
  }, [showId]);
  return duplicate;
}
