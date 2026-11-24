import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import './HorizontalRow.css';

/**
 * A titled row of cards that scrolls sideways. It scrolls by touch, by keyboard (the track is
 * focusable) and with previous and next buttons that disable at either end.
 */
export function HorizontalRow({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const { t } = useTranslation('public');
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  useEffect(() => {
    const node = track.current;
    if (!node) return;
    const update = () =>
      setEdges({
        start: node.scrollLeft <= 1,
        end: node.scrollLeft + node.clientWidth >= node.scrollWidth - 1,
      });
    update();
    node.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(node);
    return () => {
      node.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [children]);

  function scroll(direction: -1 | 1) {
    const node = track.current;
    if (!node) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    node.scrollBy({
      left: direction * node.clientWidth * 0.85,
      behavior: reduced ? 'auto' : 'smooth',
    });
  }

  return (
    <section className="h-row" aria-label={title}>
      <div className="h-row-head">
        <h2>{title}</h2>
        {action}
        <div className="h-row-buttons">
          <button
            type="button"
            aria-label={t('public:discovery_rowPrevious', { title })}
            disabled={edges.start}
            onClick={() => scroll(-1)}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={t('public:discovery_rowNext', { title })}
            disabled={edges.end}
            onClick={() => scroll(1)}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="h-row-track" ref={track} tabIndex={0} role="group" aria-label={title}>
        {children}
      </div>
    </section>
  );
}
