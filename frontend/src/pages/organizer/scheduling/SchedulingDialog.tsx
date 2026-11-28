import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { ModalPortal } from '../../../components/feedback/ModalPortal';
import './scheduling.css';

const focusable =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** A modal workspace dialog: focus moves in, Tab stays inside and Escape closes unless busy. */
export function SchedulingDialog({
  title,
  description,
  onClose,
  busy,
  children,
  wide,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
  wide?: boolean;
}) {
  const { t } = useTranslation('scheduling');
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  const opener = useRef(document.activeElement as HTMLElement | null);

  useEffect(() => {
    const previous = opener.current;
    panel.current?.querySelector<HTMLElement>('input, select, button:not([data-close])')?.focus();
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy && !event.defaultPrevented) onClose();
      if (event.key !== 'Tab' || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(focusable)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <ModalPortal>
      <div
        className="admin-dialog-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busy) onClose();
        }}
      >
        <section
          ref={panel}
          className={wide ? 'scheduling-dialog scheduling-dialog-wide' : 'scheduling-dialog'}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <header>
            <h2 id={titleId}>{title}</h2>
            <button
              type="button"
              data-close
              aria-label={t('scheduling:close')}
              onClick={onClose}
              disabled={busy}
            >
              <X size={19} aria-hidden="true" />
            </button>
          </header>
          {description && <p className="performance-flow-help">{description}</p>}
          {children}
        </section>
      </div>
    </ModalPortal>
  );
}
