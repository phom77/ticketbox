import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  ImagePlus,
  RefreshCw,
  ScanLine,
  Smartphone,
  XCircle,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import {
  getStaffConcerts,
  scanStaffTicket,
  type StaffConcert,
  type StaffScanTicketResponse,
} from '../../api/admin';
import { commandMessage, isRequestCanceled } from '../../api/client';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { ConcertPicker } from '../../components/admin/ConcertPicker';
import { useToast } from '../../components/feedback/toast-context';
import { getOrCreateStaffDeviceId, selectInitialConcert, staffDateTime } from './staffPageUtils';

type BarcodeDetectorResult = { rawValue?: string };
type BarcodeDetectorInstance = {
  detect(source: ImageBitmapSource): Promise<BarcodeDetectorResult[]>;
};
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;
type WindowWithBarcodeDetector = Window & { BarcodeDetector?: BarcodeDetectorConstructor };

const imageTypes = ['image/png', 'image/jpeg', 'image/webp'];

export function StaffCheckInPage() {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [concerts, setConcerts] = useState<StaffConcert[]>([]);
  const [selectedConcertId, setSelectedConcertId] = useState('');
  const [loadingConcerts, setLoadingConcerts] = useState(true);
  const [error, setError] = useState('');
  const [gate, setGate] = useState('WEB');
  const [deviceId] = useState(getOrCreateStaffDeviceId);
  const [previewUrl, setPreviewUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [decodedQr, setDecodedQr] = useState('');
  const [decodeError, setDecodeError] = useState('');
  const [decoding, setDecoding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scanResult, setScanResult] = useState<StaffScanTicketResponse | null>(null);

  const selectedConcert = useMemo(
    () => concerts.find((concert) => concert.id === selectedConcertId) ?? null,
    [concerts, selectedConcertId],
  );

  useEffect(() => {
    const controller = new AbortController();
    async function loadConcerts() {
      setLoadingConcerts(true);
      setError('');
      try {
        const data = await getStaffConcerts('ON_SALE', controller.signal);
        setConcerts(data.content);
        setSelectedConcertId(
          (current) => current || selectInitialConcert(data.content, searchParams.get('concert')),
        );
      } catch (requestError) {
        if (!isRequestCanceled(requestError)) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Không thể tải danh sách concert.',
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoadingConcerts(false);
      }
    }
    void loadConcerts();
    return () => controller.abort();
  }, [searchParams]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setScanResult(null);
    setDecodedQr('');
    setDecodeError('');
    setFileName('');
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');

    if (!file) return;
    setFileName(file.name);

    if (!imageTypes.includes(file.type)) {
      setDecodeError('Hãy tải ảnh QR định dạng PNG, JPG hoặc WEBP.');
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    setPreviewUrl(nextPreviewUrl);
    setDecoding(true);
    try {
      const qrValue = await decodeQrFromImage(file);
      setDecodedQr(qrValue);
    } catch (decodeFailure) {
      setDecodeError(
        decodeFailure instanceof Error ? decodeFailure.message : 'Không đọc được QR trong ảnh.',
      );
    } finally {
      setDecoding(false);
    }
  }

  async function submitScan() {
    if (!selectedConcertId || !decodedQr) return;
    setSubmitting(true);
    setError('');
    setScanResult(null);
    try {
      const result = await scanStaffTicket({
        qrCode: decodedQr,
        concertId: selectedConcertId,
        deviceId,
        gate: gate.trim() || 'WEB',
      });
      setScanResult(result.data);
      const message = commandMessage(result.message, result.data.message);
      if (result.data.status === 'SUCCESS') {
        toast.success(message);
      } else {
        toast.error(message);
      }
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : 'Không thể check-in vé.';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <AdminPageHeader
        eyebrow="Bàn kiểm soát cổng"
        title="Check-in bằng ảnh QR"
        description="Tải ảnh QR từ vé điện tử, web sẽ đọc mã và gọi API check-in online. Dùng scanner mobile khi cần camera trực tiếp và đồng bộ offline."
        actions={
          <a
            className="admin-secondary-action"
            href="http://localhost:8081"
            target="_blank"
            rel="noreferrer"
          >
            <Smartphone aria-hidden="true" size={17} />
            Mobile Scanner
          </a>
        }
      />

      {error ? (
        <div className="admin-notice error" role="alert">
          {error}
        </div>
      ) : null}

      <section className="staff-desk-grid">
        <div className="staff-panel">
          <div className="guest-section-heading">
            <div>
              <span>Quét online</span>
              <h2>Thông tin ca trực</h2>
            </div>
            <ScanLine aria-hidden="true" size={22} />
          </div>

          <ConcertPicker
            concerts={concerts}
            value={selectedConcertId}
            label="Concert của ca trực"
            placeholder={loadingConcerts ? 'Đang tải concert...' : 'Không có concert đang bán'}
            disabled={loadingConcerts || !concerts.length}
            onChange={(id) => {
              setSelectedConcertId(id);
              setScanResult(null);
            }}
          />

          <label className="admin-field">
            Cổng
            <input
              value={gate}
              onChange={(event) => setGate(event.target.value)}
              placeholder="VD: A, B, WEB"
            />
          </label>

          <div className="staff-selected-concert">
            {selectedConcert ? (
              <>
                <strong>{selectedConcert.title}</strong>
                <span>
                  {selectedConcert.venueName}, {selectedConcert.venueAddress}
                </span>
                <span>{staffDateTime.format(new Date(selectedConcert.eventDate))}</span>
              </>
            ) : (
              <span>Chọn concert để bắt đầu check-in.</span>
            )}
          </div>
        </div>

        <div className="staff-panel">
          <div className="guest-section-heading">
            <div>
              <span>Tải QR</span>
              <h2>Tải ảnh vé</h2>
            </div>
            <ImagePlus aria-hidden="true" size={22} />
          </div>

          <label className={`staff-qr-picker ${previewUrl ? 'has-file' : ''}`}>
            <input
              accept="image/png,image/jpeg,image/webp"
              type="file"
              onChange={(event) => void handleFileChange(event)}
            />
            {previewUrl ? <img alt="" src={previewUrl} /> : <Camera aria-hidden="true" size={34} />}
            <span>{fileName || 'Chọn ảnh có mã QR'}</span>
            <small>Chrome/Edge có hỗ trợ đọc QR trực tiếp từ ảnh tải lên.</small>
          </label>

          {decoding ? <div className="admin-notice">Đang đọc mã QR từ ảnh...</div> : null}
          {decodeError ? (
            <div className="admin-notice error" role="alert">
              {decodeError}
            </div>
          ) : null}
          {decodedQr ? (
            <div className="staff-decoded-qr">
              <CheckCircle2 aria-hidden="true" size={18} />
              <div>
                <strong>Đã đọc được QR</strong>
                <span>{decodedQr}</span>
              </div>
            </div>
          ) : null}

          <button
            className="admin-primary-action"
            disabled={!selectedConcertId || !decodedQr || submitting}
            type="button"
            onClick={() => void submitScan()}
          >
            {submitting ? (
              <RefreshCw aria-hidden="true" size={16} />
            ) : (
              <ScanLine aria-hidden="true" size={16} />
            )}
            {submitting ? 'Đang check-in' : 'Xác nhận check-in'}
          </button>
        </div>
      </section>

      {scanResult ? (
        <section
          className={`staff-scan-result ${scanResult.status === 'SUCCESS' ? 'success' : 'failed'}`}
          aria-live="polite"
        >
          {scanResult.status === 'SUCCESS' ? (
            <CheckCircle2 aria-hidden="true" size={30} />
          ) : (
            <XCircle aria-hidden="true" size={30} />
          )}
          <div>
            <span>
              {scanResult.status === 'SUCCESS' ? 'Check-in thành công' : 'Máy chủ từ chối'}
            </span>
            <h2>{scanResult.message}</h2>
            <p>
              {scanResult.ticketId ? `Vé ${scanResult.ticketId}` : 'Không tìm thấy vé phù hợp'}
              {' - '}
              {staffDateTime.format(new Date(scanResult.checkAt))}
            </p>
          </div>
        </section>
      ) : null}
    </>
  );
}

async function decodeQrFromImage(file: File) {
  const BarcodeDetector = (window as WindowWithBarcodeDetector).BarcodeDetector;
  if (!BarcodeDetector) {
    throw new Error(
      'Trình duyệt này chưa hỗ trợ đọc QR từ ảnh. Hãy dùng Chrome/Edge hoặc Mobile Scanner.',
    );
  }

  const image = await createImageBitmap(file);
  try {
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    const results = await detector.detect(image);
    const rawValue = results.find((result) => result.rawValue)?.rawValue?.trim();
    if (!rawValue) {
      throw new Error('Không tìm thấy mã QR trong ảnh này.');
    }
    return rawValue;
  } finally {
    image.close();
  }
}
