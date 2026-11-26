import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { getArtistBioJob } from '../../api/admin';
import { isRequestCanceled } from '../../api/client';
import { submitEventArtistBioJob } from '../../api/eventContent';

const pollMs = 2_000;
const maxPolls = 60;

/**
 * Creates an artist biography draft from a PDF. The draft is placed in the bio field for the organizer to
 * review; it only reaches buyers once the event details are saved (and approved, after release).
 */
export function EventBioGenerator({
  eventId,
  onGenerated,
}: {
  eventId?: string;
  onGenerated: (bio: string) => void;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState('');
  const [phase, setPhase] = useState<'idle' | 'sending' | 'working' | 'done' | 'failed'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!jobId) return;
    const controller = new AbortController();
    let polls = 0;
    const timer = window.setInterval(() => {
      polls += 1;
      getArtistBioJob(jobId, controller.signal, 'organizer')
        .then((job) => {
          if (controller.signal.aborted) return;
          if (job.status === 'DONE' && job.resultBio) {
            window.clearInterval(timer);
            setPhase('done');
            onGenerated(job.resultBio);
          } else if (job.status === 'FAILED' || polls >= maxPolls) {
            window.clearInterval(timer);
            setPhase('failed');
            setError(job.errorMessage || t('event-content:bioFailed'));
          }
        })
        .catch((failure: unknown) => {
          if (isRequestCanceled(failure)) return;
          window.clearInterval(timer);
          setPhase('failed');
          setError(failure instanceof Error ? failure.message : t('event-content:bioFailed'));
        });
    }, pollMs);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
    // The callback only reads the result; restarting the poll on every render would never finish.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  async function generate() {
    if (!eventId || !file) return;
    setPhase('sending');
    setError('');
    try {
      const submitted = await submitEventArtistBioJob(eventId, file);
      setJobId(submitted.data.jobId);
      setPhase('working');
    } catch (failure) {
      setPhase('failed');
      setError(failure instanceof Error ? failure.message : t('event-content:bioFailed'));
    }
  }

  return (
    <div className="event-bio-generator performance-wide">
      <h3>{t('event-content:bioGenerateTitle')}</h3>
      {!eventId ? (
        <p className="performance-flow-help">{t('event-content:bioNeedsSavedEvent')}</p>
      ) : (
        <>
          <p className="performance-flow-help">{t('event-content:bioGenerateHelp')}</p>
          <div className="event-poster-actions">
            <label htmlFor={inputId} className="event-bio-file">
              {t('event-content:bioFile')}
              <input
                id={inputId}
                type="file"
                accept="application/pdf,.pdf"
                disabled={phase === 'sending' || phase === 'working'}
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setPhase('idle');
                  setJobId('');
                }}
              />
            </label>
            <button
              type="button"
              className="button button-secondary"
              disabled={!file || phase === 'sending' || phase === 'working'}
              onClick={() => void generate()}
            >
              <Sparkles size={17} aria-hidden="true" />
              {t(
                phase === 'working' || phase === 'sending'
                  ? 'event-content:bioWorking'
                  : 'event-content:bioGenerate',
              )}
            </button>
          </div>
          <p role="status" className="performance-flow-help">
            {phase === 'working' && t('event-content:bioWaiting')}
            {phase === 'done' && t('event-content:bioReady')}
          </p>
          {phase === 'failed' && (
            <p className="performance-flow-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
