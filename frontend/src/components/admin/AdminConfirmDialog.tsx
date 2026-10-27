import { useEffect, useId, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { ModalPortal } from '../feedback/ModalPortal';

type AdminConfirmDialogProps = {
  title: string;
  description: string;
  confirmLabel?: string;
  loading?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function AdminConfirmDialog({
  title,
  description,
  confirmLabel = 'Xóa',
  loading = false,
  destructive = true,
  onConfirm,
  onClose,
}: AdminConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !loading) onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [loading, onClose]);

  return (
    <ModalPortal>
      <div
        className="admin-dialog-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !loading) onClose();
        }}
      >
      <section
        className="admin-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header>
          <span className="admin-confirm-icon">
            <AlertTriangle aria-hidden="true" size={21} />
          </span>
          <button type="button" aria-label="Đóng" onClick={onClose} disabled={loading}>
            <X aria-hidden="true" size={19} />
          </button>
        </header>
        <div className="admin-confirm-content">
          <span>Yêu cầu xác nhận</span>
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{description}</p>
        </div>
        <footer>
          <button
            ref={cancelRef}
            className="admin-secondary-action"
            type="button"
            onClick={onClose}
            disabled={loading}
          >
            Hủy
          </button>
          <button
            className={destructive ? 'admin-danger-action' : 'admin-primary-action'}
            type="button"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Đang xử lý...' : confirmLabel}
          </button>
        </footer>
      </section>
      </div>
    </ModalPortal>
  );
}
