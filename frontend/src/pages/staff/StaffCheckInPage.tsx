import { type ChangeEvent, type FormEvent, useRef, useState } from 'react';
import { CheckCircle2, CloudOff, ImagePlus, ScanLine, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getStaffCheckinHistory, scanStaffTicket, type StaffPerformance } from '../../api/admin';
import { ApiClientError } from '../../api/client';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { canReadQrFromCamera, decodeQrFromImage } from './cameraSupport';
import { LiveCameraReader } from './LiveCameraReader';
import { StaffAccessGate } from './StaffAccessGate';
import { getOrCreateStaffDeviceId, staffDateTime, useStaffGate } from './staffPageUtils';
import './staff.css';

const imageTypes = ['image/png', 'image/jpeg', 'image/webp'];
const repeatIgnoreMs = 3000;

type Outcome =
  | {
      kind: 'allowed';
      at: string;
      reference?: string | null;
      ticketType?: string | null;
      gate: string;
    }
  | { kind: 'rejected'; message: string }
  | { kind: 'notRecorded' };

export function StaffCheckInPage() {
  const { t } = useTranslation();
  return (
    <>
      <AdminPageHeader
        title={t('staff:checkInTitle')}
        description={t('staff:checkInDescription')}
      />
      <StaffAccessGate select>
        {({ performance, reportDenied }) =>
          performance ? (
            <CheckInDesk
              key={performance.id}
              performance={performance}
              reportDenied={reportDenied}
            />
          ) : null
        }
      </StaffAccessGate>
    </>
  );
}

function CheckInDesk({
  performance,
  reportDenied,
}: {
  performance: StaffPerformance;
  reportDenied: (failure: unknown) => boolean;
}) {
  const { t } = useTranslation();
  const [gate, setGate] = useStaffGate(performance.id);
  const [deviceId] = useState(getOrCreateStaffDeviceId);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [imageError, setImageError] = useState('');
  const inFlight = useRef(false);
  const lastRead = useRef<{ code: string; at: number } | null>(null);

  async function submit(raw: string) {
    const value = raw.trim();
    if (!value || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const usedGate = gate.trim() || 'WEB';
    try {
      const { data } = await scanStaffTicket(performance.id, {
        qrCode: value,
        deviceId,
        gate: usedGate,
      });
      if (data.status === 'SUCCESS') {
        setCode('');
        const allowed: Outcome = { kind: 'allowed', at: data.checkAt, gate: usedGate };
        setOutcome(allowed);
        void showTicket(data.ticketId, allowed);
      } else {
        setOutcome({ kind: 'rejected', message: data.message });
      }
    } catch (failure) {
      if (reportDenied(failure)) return;
      if (failure instanceof ApiClientError && failure.status >= 400 && failure.status < 500) {
        setOutcome({ kind: 'rejected', message: failure.message });
      } else {
        setOutcome({ kind: 'notRecorded' });
      }
    } finally {
      lastRead.current = { code: value, at: Date.now() };
      inFlight.current = false;
      setBusy(false);
    }
  }

  /** The scan response has no ticket details, so read them from the admission just recorded. */
  async function showTicket(
    ticketId: string | null,
    allowed: Extract<Outcome, { kind: 'allowed' }>,
  ) {
    if (!ticketId) return;
    try {
      const page = await getStaffCheckinHistory(performance.id, 0, 10);
      const entry = page.content.find((row) => row.ticketId === ticketId);
      if (entry)
        setOutcome((current) =>
          current === allowed
            ? { ...allowed, reference: entry.referenceCode, ticketType: entry.ticketTypeName }
            : current,
        );
    } catch {
      // The confirmation already stands without ticket details.
    }
  }

  function onCamera(value: string) {
    if (inFlight.current) return;
    const last = lastRead.current;
    if (last && last.code === value && Date.now() - last.at < repeatIgnoreMs) return;
    setCode(value);
    void submit(value);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(code);
  }

  async function onImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    setImageError('');
    if (!file) return;
    if (!imageTypes.includes(file.type)) {
      setImageError(t('staff:imageType'));
      return;
    }
    try {
      const value = await decodeQrFromImage(file);
      setCode(value);
      await submit(value);
    } catch (failure) {
      setImageError(failure === 'unsupported' ? t('staff:imageUnsupported') : t('staff:imageNone'));
    }
  }

  return (
    <>
      <section className="staff-desk-grid">
        <form className="staff-panel" onSubmit={onSubmit}>
          <div className="guest-section-heading">
            <div>
              <h2>{t('staff:codeTitle')}</h2>
            </div>
            <ScanLine aria-hidden="true" size={22} />
          </div>
          <label className="admin-field">
            {t('staff:gate')}
            <input
              value={gate}
              maxLength={100}
              onChange={(event) => setGate(event.target.value)}
              placeholder={t('staff:gatePlaceholder')}
            />
          </label>
          <label className="admin-field">
            {t('staff:codeLabel')}
            <input
              value={code}
              maxLength={500}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(event) => setCode(event.target.value)}
              aria-describedby="staff-code-help"
            />
          </label>
          <small id="staff-code-help">{t('staff:codeHelp')}</small>
          <button className="admin-primary-action" type="submit" disabled={busy || !code.trim()}>
            <ScanLine aria-hidden="true" size={16} />
            {busy ? t('staff:submitting') : t('staff:submit')}
          </button>
        </form>

        <div className="staff-panel">
          <div className="guest-section-heading">
            <div>
              <h2>{t('staff:cameraTitle')}</h2>
            </div>
          </div>
          {canReadQrFromCamera() ? (
            <LiveCameraReader onCode={onCamera} />
          ) : (
            <p>{t('staff:cameraUnsupported')}</p>
          )}
          <h3>
            <ImagePlus aria-hidden="true" size={18} /> {t('staff:imageTitle')}
          </h3>
          <label className="staff-qr-picker">
            <input
              accept={imageTypes.join(',')}
              type="file"
              onChange={(event) => void onImage(event)}
            />
            <span>{t('staff:imageChoose')}</span>
            <small>{t('staff:imageHelp')}</small>
          </label>
          {imageError ? <p role="alert">{imageError}</p> : null}
        </div>
      </section>
      <section aria-live="polite" className="staff-outcome-region">
        {outcome ? <OutcomeView outcome={outcome} /> : null}
      </section>
    </>
  );
}

function OutcomeView({ outcome }: { outcome: Outcome }) {
  const { t } = useTranslation();
  if (outcome.kind === 'allowed')
    return (
      <div className="staff-scan-result success">
        <CheckCircle2 aria-hidden="true" size={30} />
        <div>
          <h2>{t('staff:allowed')}</h2>
          <p>{t('staff:allowedDetail')}</p>
          {outcome.reference ? (
            <p>{t('staff:ticketReference', { reference: outcome.reference })}</p>
          ) : null}
          {outcome.ticketType ? <p>{t('staff:ticketType', { type: outcome.ticketType })}</p> : null}
          <p>
            {t('staff:outcomeGate', { gate: outcome.gate })} · {staffDateTime(outcome.at)}
          </p>
        </div>
      </div>
    );
  if (outcome.kind === 'rejected')
    return (
      <div className="staff-scan-result failed">
        <XCircle aria-hidden="true" size={30} />
        <div>
          <h2>{t('staff:notAccepted')}</h2>
          <p>{outcome.message}</p>
        </div>
      </div>
    );
  return (
    <div className="staff-scan-result warning">
      <CloudOff aria-hidden="true" size={30} />
      <div>
        <h2>{t('staff:notRecorded')}</h2>
        <p>{t('staff:notRecordedBody')}</p>
      </div>
    </div>
  );
}
