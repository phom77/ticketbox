import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react';
import { CheckCircle2, CloudOff, ImagePlus, ScanLine, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  getStaffCheckinHistory,
  getStaffPerformanceOverview,
  scanStaffTicket,
  type StaffPerformance,
  type StaffPerformanceOverview,
} from '../../api/admin';
import { ApiClientError, isRequestCanceled } from '../../api/client';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { formatLanguage } from '../../i18n';
import { canReadQrFromCamera, decodeQrFromImage } from './cameraSupport';
import { LiveCameraReader } from './LiveCameraReader';
import { StaffAccessGate } from './StaffAccessGate';
import { getOrCreateStaffDeviceId, staffDateTime, useStaffGate } from './staffPageUtils';
import './staff.css';

const imageTypes = ['image/png', 'image/jpeg', 'image/webp'];
/** The same code is ignored this long after a rejection, and longer after an admission. */
const repeatIgnoreMs = 3000;
const repeatIgnoreAfterAdmissionMs = 30_000;

type Outcome =
  | {
      kind: 'allowed';
      at: string;
      reference?: string | null;
      ticketType?: string | null;
      gate: string;
    }
  | { kind: 'rejected'; message: string; earlierAttemptHint?: boolean }
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
  const [scanSeq, setScanSeq] = useState(0);
  const [admissions, setAdmissions] = useState(0);
  const inFlight = useRef(false);
  const lastRead = useRef<{ code: string; at: number; admitted: boolean } | null>(null);
  const unconfirmedCode = useRef<string | null>(null);

  function show(next: Outcome) {
    setScanSeq((value) => value + 1);
    setOutcome(next);
  }

  async function submit(raw: string) {
    const value = raw.trim();
    if (!value || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const usedGate = gate.trim() || 'WEB';
    let admitted = false;
    const retryOfUnconfirmed = unconfirmedCode.current === value;
    try {
      const { data } = await scanStaffTicket(performance.id, {
        qrCode: value,
        deviceId,
        gate: usedGate,
      });
      if (data.status === 'SUCCESS') {
        admitted = true;
        unconfirmedCode.current = null;
        setCode('');
        setAdmissions((count) => count + 1);
        const allowed: Outcome = { kind: 'allowed', at: data.checkAt, gate: usedGate };
        show(allowed);
        void showTicket(data.ticketId, allowed);
      } else {
        unconfirmedCode.current = null;
        // A rejection that names a ticket (not an unknown code) after an unconfirmed attempt of the
        // same code most likely means that attempt was recorded.
        show({
          kind: 'rejected',
          message: data.message,
          earlierAttemptHint: retryOfUnconfirmed && !!data.ticketId,
        });
      }
    } catch (failure) {
      if (reportDenied(failure)) return;
      if (failure instanceof ApiClientError && failure.status >= 400 && failure.status < 500) {
        show({ kind: 'rejected', message: failure.message });
      } else {
        unconfirmedCode.current = value;
        show({ kind: 'notRecorded' });
      }
    } finally {
      lastRead.current = { code: value, at: Date.now(), admitted };
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
    const window = last?.admitted ? repeatIgnoreAfterAdmissionMs : repeatIgnoreMs;
    if (last && last.code === value && Date.now() - last.at < window) return;
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
      <PerformanceFigures
        performanceId={performance.id}
        refreshKey={admissions}
        reportDenied={reportDenied}
      />
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
        {outcome ? <OutcomeView key={scanSeq} outcome={outcome} /> : null}
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
          {outcome.earlierAttemptHint ? <p>{t('staff:earlierAttemptHint')}</p> : null}
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

/** Admitted against valid and used tickets, and how fresh the ticket list is, for the open performance. */
function PerformanceFigures({
  performanceId,
  refreshKey,
  reportDenied,
}: {
  performanceId: string;
  refreshKey: number;
  reportDenied: (failure: unknown) => boolean;
}) {
  const { t } = useTranslation();
  const [overview, setOverview] = useState<StaffPerformanceOverview | null>(null);
  const [failed, setFailed] = useState(false);
  const denied = useRef(reportDenied);
  useEffect(() => {
    denied.current = reportDenied;
  });

  useEffect(() => {
    const controller = new AbortController();
    getStaffPerformanceOverview(performanceId, controller.signal)
      .then((value) => {
        setOverview(value);
        setFailed(false);
      })
      .catch((failure) => {
        if (isRequestCanceled(failure) || controller.signal.aborted) return;
        if (!denied.current(failure)) setFailed(true);
      });
    return () => controller.abort();
  }, [performanceId, refreshKey]);

  if (failed && !overview) return <p role="status">{t('staff:figuresFailed')}</p>;
  if (!overview) return null;
  const number = new Intl.NumberFormat(formatLanguage());
  return (
    <p className="staff-figures">
      <strong>
        {t('staff:figuresAdmitted', {
          checked: number.format(overview.totalCheckins),
          total: number.format(overview.validTickets + overview.usedTickets),
        })}
      </strong>
      {' · '}
      {overview.datasetUpdatedAt
        ? t('staff:figuresDataset', { time: staffDateTime(overview.datasetUpdatedAt) })
        : t('staff:figuresNoDataset')}
    </p>
  );
}
