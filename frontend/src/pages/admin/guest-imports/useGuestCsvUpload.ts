import { type FormEvent, useRef, useState } from 'react';
import { importGuestList, type ManagementApiScope } from '../../../api/admin';
import { useToast } from '../../../components/feedback/toast-context';
import { translate } from '../../../i18n';

/** Validates and uploads a guest CSV (up to 10 MB), then hands the new batch to the tracker. */
export function useGuestCsvUpload({
  apiScope,
  uploadMode,
  showUploaded,
  refreshLogs,
}: {
  apiScope: ManagementApiScope;
  uploadMode: 'immediate' | 'scheduled';
  showUploaded: (batchLogId: string) => Promise<void>;
  refreshLogs: () => Promise<void>;
}) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function chooseFile(nextFile: File | null) {
    if (!nextFile) {
      setFile(null);
      return;
    }
    if (!nextFile.name.toLowerCase().endsWith('.csv')) {
      setFile(null);
      toast.error(translate('admin:adminGuestImportsPage_chiChapNhanFileCoDinhDang'));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (nextFile.size === 0) {
      setFile(null);
      toast.error(translate('admin:adminGuestImportsPage_fileCsvKhongDuocDeTrong'));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (nextFile.size > 10 * 1024 * 1024) {
      setFile(null);
      toast.error(translate('admin:adminGuestImportsPage_fileCsvKhongDuocVuotQua10'));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setFile(nextFile);
  }

  async function submitUpload(event: FormEvent, uploadConcertId: string) {
    event.preventDefault();
    if (!file || !uploadConcertId) return;
    setUploading(true);
    try {
      const scheduled = uploadMode === 'scheduled';
      const result = await importGuestList(uploadConcertId, file, apiScope, scheduled);
      toast.success(
        scheduled
          ? translate('admin:adminGuestImportsPage_daXepFileCsvVaoHangCho')
          : translate('admin:adminGuestImportsPage_daTiepNhanFileCsvDeXu'),
      );
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await showUploaded(result.data.batchLogId);
      await refreshLogs();
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : translate('admin:adminGuestImportsPage_khongTheTaiFileCsvLen'),
      );
    } finally {
      setUploading(false);
    }
  }

  return { file, uploading, fileInputRef, chooseFile, submitUpload };
}
