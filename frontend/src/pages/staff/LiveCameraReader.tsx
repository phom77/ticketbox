import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { canReadQrFromCamera, detectorConstructor } from './cameraSupport';

type CameraState = 'off' | 'starting' | 'on' | 'denied' | 'none' | 'busy' | 'paused';

/** Live reader. Starts only on request, stops when hidden, unmounted or a dialog opens. */
export function LiveCameraReader({ onCode }: { onCode: (code: string) => void }) {
  const { t } = useTranslation();
  const [state, setState] = useState<CameraState>('off');
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const handler = useRef(onCode);
  useEffect(() => {
    handler.current = onCode;
  });

  const stop = useCallback((next: CameraState) => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setState(next);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'hidden' && stream.current) stop('paused');
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [stop]);

  useEffect(() => {
    const element = video.current;
    if (state !== 'on' || !element || !stream.current) return;
    element.srcObject = stream.current;
    void element.play?.().catch(() => undefined);
  }, [state]);

  useEffect(() => {
    const Constructor = detectorConstructor();
    if (state !== 'on' || !Constructor) return;
    const detector = new Constructor({ formats: ['qr_code'] });
    let busy = false;
    const timer = window.setInterval(() => {
      if (busy) return;
      if (document.querySelector('dialog[open]')) {
        stop('paused');
        return;
      }
      const element = video.current;
      if (!element || element.readyState < 2) return;
      busy = true;
      detector
        .detect(element)
        .then((found) => {
          const value = found.find((entry) => entry.rawValue)?.rawValue?.trim();
          if (value) handler.current(value);
        })
        .catch(() => undefined)
        .finally(() => {
          busy = false;
        });
    }, 250);
    return () => window.clearInterval(timer);
  }, [state, stop]);

  async function start() {
    setState('starting');
    try {
      const opened = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      // The page may have gone away or been hidden while the permission prompt was open.
      if (!mounted.current || document.visibilityState === 'hidden') {
        opened.getTracks().forEach((track) => track.stop());
        if (mounted.current) setState('paused');
        return;
      }
      stream.current = opened;
      setState('on');
    } catch (failure) {
      if (!mounted.current) return;
      const name = failure instanceof DOMException ? failure.name : '';
      setState(
        name === 'NotFoundError' || name === 'OverconstrainedError'
          ? 'none'
          : name === 'NotReadableError'
            ? 'busy'
            : 'denied',
      );
    }
  }

  if (!canReadQrFromCamera()) return <p>{t('staff:cameraUnsupported')}</p>;
  const message: Partial<Record<CameraState, string>> = {
    starting: t('staff:cameraStarting'),
    on: t('staff:cameraScanning'),
    denied: t('staff:cameraDenied'),
    none: t('staff:cameraNone'),
    busy: t('staff:cameraInUse'),
    paused: t('staff:cameraPaused'),
  };
  const active = state === 'on' || state === 'starting';
  return (
    <div className="staff-camera">
      {state === 'on' ? <video ref={video} muted playsInline aria-hidden="true" /> : null}
      {message[state] ? (
        <p role={state === 'denied' || state === 'none' || state === 'busy' ? 'alert' : 'status'}>
          {message[state]}
        </p>
      ) : null}
      <button
        type="button"
        className="admin-secondary-action"
        disabled={state === 'starting'}
        onClick={() => (active ? stop('off') : void start())}
      >
        <Camera aria-hidden="true" size={16} />
        {active ? t('staff:cameraStop') : t('staff:cameraStart')}
      </button>
    </div>
  );
}
