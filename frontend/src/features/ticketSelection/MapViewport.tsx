import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { clampView, initialView, zoomView, type View } from './selection';

const dragThreshold = 4;

/**
 * Pan and zoom for any map content: buttons, Ctrl + wheel (also trackpad pinch) and
 * two-finger pinch. A drag only starts after a few pixels so clicks on sections still work.
 */
export function MapViewport({
  children,
  tip,
  resetKey,
}: {
  children: ReactNode;
  /** Description of the hovered or focused section or seat. */
  tip?: string | null;
  /** Changing it returns to the full map. */
  resetKey?: string | null;
}) {
  const { t } = useTranslation('customer');
  const stage = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(initialView);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: false, startX: 0, startY: 0, pinch: 0 });

  useEffect(() => setView(initialView), [resetKey]);

  const zoom = (factor: number, focus?: { x: number; y: number }) => {
    const rect = stage.current?.getBoundingClientRect();
    if (!rect) return;
    const at = focus ?? { x: rect.width / 2, y: rect.height / 2 };
    setView((current) => clampView(zoomView(current, factor, at), rect.width, rect.height));
  };

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
      setView((current) =>
        clampView(
          zoomView(current, factor, { x: event.clientX - rect.left, y: event.clientY - rect.top }),
          rect.width,
          rect.height,
        ),
      );
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  function down(event: PointerEvent<HTMLDivElement>) {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const state = gesture.current;
    state.moved = false;
    state.startX = event.clientX;
    state.startY = event.clientY;
    state.pinch = 0;
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId);
    const rect = stage.current?.getBoundingClientRect();
    if (!previous || !rect) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const state = gesture.current;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (state.pinch)
        zoom(distance / state.pinch, {
          x: (a.x + b.x) / 2 - rect.left,
          y: (a.y + b.y) / 2 - rect.top,
        });
      state.pinch = distance;
      state.moved = true;
      return;
    }
    if (view.scale <= 1) return;
    if (
      !state.moved &&
      Math.hypot(event.clientX - state.startX, event.clientY - state.startY) < dragThreshold
    )
      return;
    if (!state.moved) event.currentTarget.setPointerCapture(event.pointerId);
    state.moved = true;
    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    setView((current) =>
      clampView({ ...current, x: current.x + dx, y: current.y + dy }, rect.width, rect.height),
    );
  }

  function up(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    gesture.current.pinch = 0;
  }

  return (
    <div className="ts-viewport" data-zoomed={view.scale > 1}>
      <div
        ref={stage}
        className="ts-viewport-stage"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={(event) => {
          if (gesture.current.moved) {
            event.stopPropagation();
            gesture.current.moved = false;
          }
        }}
      >
        <div
          className="ts-viewport-content"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        >
          {children}
        </div>
      </div>
      {tip ? (
        <p className="ts-tip" aria-hidden="true">
          {tip}
        </p>
      ) : null}
      <div className="ts-zoom" role="group" aria-label={t('customer:ticketSelection_zoom')}>
        <button
          type="button"
          aria-label={t('customer:ticketSelection_zoomIn')}
          onClick={() => zoom(1.4)}
        >
          <Plus size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={t('customer:ticketSelection_zoomOut')}
          onClick={() => zoom(1 / 1.4)}
        >
          <Minus size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={t('customer:ticketSelection_zoomReset')}
          disabled={view.scale === 1}
          onClick={() => setView(initialView)}
        >
          <Maximize2 size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
