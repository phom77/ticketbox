import { FileClock, FileText, UploadCloud } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BatchLog } from '../../../api/admin';
import type { ConcertDetail } from '../../../api/concerts';
import { ConcertPicker } from '../../../components/admin/ConcertPicker';
import { translate } from '../../../i18n';
import { BatchSnapshot } from './BatchSnapshot';
import type { useGuestCsvUpload } from './useGuestCsvUpload';

/** The CSV upload form beside the progress of the latest batch. */
export function GuestUploadPanel({
  concerts,
  loadingConcerts,
  uploadConcertId,
  setUploadConcertId,
  uploadMode,
  upload,
  latestBatch,
  concertNames,
  openDetail,
}: {
  concerts: ConcertDetail[];
  loadingConcerts: boolean;
  uploadConcertId: string;
  setUploadConcertId: (concertId: string) => void;
  uploadMode: 'immediate' | 'scheduled';
  upload: ReturnType<typeof useGuestCsvUpload>;
  latestBatch: BatchLog | null;
  concertNames: Map<string, string>;
  openDetail: (log: BatchLog) => void;
}) {
  useTranslation();
  const { file, uploading, fileInputRef, chooseFile } = upload;
  const submitUpload = (event: React.FormEvent) => void upload.submitUpload(event, uploadConcertId);
  return (
    <section className="guest-import-workspace">
      <form className="guest-upload-panel" onSubmit={submitUpload}>
        <div className="guest-section-heading">
          <div>
            <span>
              {uploadMode === 'scheduled'
                ? translate('admin:adminGuestImportsPage_importTheoLich')
                : translate('admin:adminGuestImportsPage_importThuCong')}
            </span>
            <h2>{translate('admin:adminGuestImportsPage_taiDanhSachMoi')}</h2>
          </div>
          <UploadCloud aria-hidden="true" size={22} />
        </div>
        <ConcertPicker
          concerts={concerts}
          value={uploadConcertId}
          onChange={setUploadConcertId}
          label={translate('admin:adminGuestImportsPage_concertNhanKhachMoi')}
          placeholder={
            loadingConcerts
              ? translate('admin:adminGuestImportsPage_dangTaiConcert')
              : translate('admin:adminGuestImportsPage_chonConcertNhanDanhSach')
          }
          disabled={loadingConcerts || uploading || !concerts.length}
        />
        <label className={`guest-file-picker ${file ? 'has-file' : ''}`}>
          <FileText aria-hidden="true" size={24} />
          <span>{file ? file.name : translate('admin:adminGuestImportsPage_chonFileCsv')}</span>
          <small>
            {file
              ? `${(file.size / 1024).toFixed(1)} KB`
              : translate('admin:adminGuestImportsPage_toiDa10Mb')}
          </small>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
            disabled={uploading}
          />
        </label>
        <button
          className="admin-primary-action"
          type="submit"
          disabled={!file || !uploadConcertId || uploading}
        >
          <UploadCloud aria-hidden="true" size={17} />
          {uploading
            ? translate('admin:adminGuestImportsPage_dangGuiFile')
            : uploadMode === 'scheduled'
              ? translate('admin:adminGuestImportsPage_duaVaoHangCho')
              : translate('admin:adminGuestImportsPage_batDauImport')}
        </button>
      </form>

      <div className="guest-latest-panel">
        <div className="guest-section-heading">
          <div>
            <span>{translate('admin:adminGuestImportsPage_tienTrinhGanNhat')}</span>
            <h2>{translate('admin:adminGuestImportsPage_trangThaiXuLy')}</h2>
          </div>
          <FileClock aria-hidden="true" size={22} />
        </div>
        {latestBatch ? (
          <BatchSnapshot
            log={latestBatch}
            concertName={concertNames.get(latestBatch.concertId ?? '')}
            onOpen={() => openDetail(latestBatch)}
          />
        ) : (
          <div className="guest-latest-empty">
            <p>{translate('admin:adminGuestImportsPage_batchVuaTaiLenSeXuatHien')}</p>
          </div>
        )}
      </div>
    </section>
  );
}
