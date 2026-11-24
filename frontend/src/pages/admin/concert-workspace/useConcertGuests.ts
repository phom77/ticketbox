import { useCallback, useEffect, useState } from 'react';
import {
  getBatchLog,
  getConcertGuestList,
  importGuestList,
  type BatchLog,
  type ManagementApiScope,
} from '../../../api/admin';
import { isRequestCanceled } from '../../../api/client';
import { useToast } from '../../../components/feedback/toast-context';
import { translate } from '../../../i18n';
import { useWorkspaceSection } from './useWorkspaceSection';

function isActiveGuestImport(status: BatchLog['status']) {
  return status === 'PENDING' || status === 'RUNNING';
}

/**
 * Guest list filters, paging and CSV import for one concert. The state lives with the workspace,
 * so filters and a chosen file survive switching tabs, and the overview can show the filtered
 * total.
 */
export function useConcertGuests(id: string | undefined, apiScope: ManagementApiScope) {
  const toast = useToast();
  const [guestQuery, setGuestQuery] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [guestPageIndex, setGuestPageIndex] = useState(0);
  const [guestImportFile, setGuestImportFile] = useState<File | null>(null);
  const [guestImportScheduled, setGuestImportScheduled] = useState(false);
  const [guestImporting, setGuestImporting] = useState(false);
  const [activeGuestImportId, setActiveGuestImportId] = useState('');

  const guestSection = useWorkspaceSection(
    !!id,
    useCallback(
      (signal: AbortSignal) =>
        getConcertGuestList(id!, guestPageIndex, 20, signal, apiScope, {
          query: guestQuery,
          activeOnly,
        }),
      [id, guestPageIndex, apiScope, guestQuery, activeOnly],
    ),
  );
  const { retry: refreshGuests } = guestSection;
  const guestTotal = guestSection.data?.totalElements;
  const visibleGuests = guestSection.data?.content ?? [];

  useEffect(() => {
    if (!activeGuestImportId) return;
    const controller = new AbortController();
    let timer: number | undefined;

    const pollImport = async () => {
      try {
        const batch = await getBatchLog(activeGuestImportId, controller.signal, apiScope);
        if (isActiveGuestImport(batch.status)) {
          timer = window.setTimeout(() => void pollImport(), 1500);
          return;
        }
        if (batch.status === 'SUCCESS' || batch.status === 'PARTIAL') {
          refreshGuests();
          if (!controller.signal.aborted) {
            toast.success(translate('admin:concertWorkspacePage_danhSachKhachMoiDaDuocCap'));
          }
        }
        if (!controller.signal.aborted) setActiveGuestImportId('');
      } catch (requestError) {
        if (!isRequestCanceled(requestError) && !controller.signal.aborted) {
          toast.error(
            requestError instanceof Error
              ? requestError.message
              : translate('admin:concertWorkspacePage_khongTheCapNhatTrangThaiNhap'),
          );
          setActiveGuestImportId('');
        }
      }
    };

    void pollImport();
    return () => {
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [activeGuestImportId, apiScope, refreshGuests, toast]);

  function chooseGuestImportFile(file: File | null) {
    if (!file) {
      setGuestImportFile(null);
      return;
    }
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error(translate('admin:concertWorkspacePage_chiChapNhanFileCsv'));
      setGuestImportFile(null);
      return;
    }
    setGuestImportFile(file);
  }

  async function submitGuestImport() {
    if (!id || !guestImportFile) return;
    setGuestImporting(true);
    try {
      const result = await importGuestList(id, guestImportFile, apiScope, guestImportScheduled);
      toast.success(
        guestImportScheduled
          ? translate('admin:concertWorkspacePage_daXepFileCsvVaoHangCho')
          : translate('admin:concertWorkspacePage_daImportDanhSachKhachMoiCho'),
      );
      setGuestImportFile(null);
      if (guestImportScheduled) {
        refreshGuests();
      } else {
        setActiveGuestImportId(result.data.batchLogId);
      }
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : translate('admin:concertWorkspacePage_khongTheImportDanhSachKhachMoi'),
      );
    } finally {
      setGuestImporting(false);
    }
  }

  return {
    guestSection,
    guestTotal,
    visibleGuests,
    guestQuery,
    setGuestQuery,
    activeOnly,
    setActiveOnly,
    guestPageIndex,
    setGuestPageIndex,
    guestImportFile,
    chooseGuestImportFile,
    guestImportScheduled,
    setGuestImportScheduled,
    guestImporting,
    submitGuestImport,
  };
}
