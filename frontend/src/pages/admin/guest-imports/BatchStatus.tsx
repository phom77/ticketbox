import { useTranslation } from 'react-i18next';
import type { BatchLogStatus } from '../../../api/admin';
import { isActiveBatch, statusLabel } from './batchLabels';

export function BatchStatus({ status }: { status: BatchLogStatus }) {
  useTranslation();
  return (
    <span className={`batch-status batch-${status.toLowerCase()}`}>
      {isActiveBatch(status) ? <i aria-hidden="true" /> : null}
      {statusLabel(status)}
    </span>
  );
}
