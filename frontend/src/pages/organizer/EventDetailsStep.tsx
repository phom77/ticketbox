import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowRight, Eye, Pencil, Send, Undo2, Trash2 } from 'lucide-react';
import { ApiClientError } from '../../api/client';
import {
  discardContentRevision,
  getEventContent,
  removeEventPoster,
  stageContentRevision,
  submitContentRevision,
  uploadEventPoster,
  withdrawContentRevision,
  type ContentRevision,
  type ContentState,
} from '../../api/eventContent';
import {
  createManagedEvent,
  updateManagedEvent,
  type ManagedEvent,
} from '../../api/performanceManagement';
import { AdminConfirmDialog } from '../../components/admin/AdminConfirmDialog';
import { useToast } from '../../components/feedback/toast-context';
import { ClassificationPicker } from '../../components/ClassificationPicker';
import { describeClassification } from '../../features/discovery/classification';
import { WorkspaceSelect } from '../../components/WorkspaceSelect';
import {
  ageRatingLabelKey,
  ageRatings,
  artistBioLimit,
  classificationInput,
  classificationOf,
  contentInput,
  emptyForm,
  formFromContent,
  openRevision,
  refundPolicyLimit,
  revisionInput,
  revisionHelpKey,
  revisionLabelKey,
  sameContent,
  type ContentForm,
} from '../../features/event/eventContent';
import { ConcertTextFields } from '../../features/concert/ConcertTextFields';
import { EventBioGenerator } from './EventBioGenerator';
import { EventPosterField } from './EventPosterField';
import './EventDetailsStep.css';

type Callbacks = {
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  onReload?: () => void;
};

/**
 * The Event details step. A new or draft event is saved directly. After a performance is released the live
 * version stays visible to buyers and edits become one reviewed revision.
 */
export function EventDetailsStep(
  props: Callbacks & {
    event?: ManagedEvent;
    released: boolean;
    onCreated?: (event: ManagedEvent) => void;
    onSaved?: (event: ManagedEvent) => void;
    onEventChange: (event: ManagedEvent) => void;
  },
) {
  return props.event && props.released ? (
    <ReleasedContent {...props} event={props.event} />
  ) : (
    <DraftContent {...props} />
  );
}

function failureText(failure: unknown, fallback: string) {
  return failure instanceof Error && failure.message ? failure.message : fallback;
}

function EventContentFields({
  form,
  onChange,
  disabled,
  poster,
  eventId,
}: {
  form: ContentForm;
  onChange: (update: (current: ContentForm) => ContentForm) => void;
  disabled: boolean;
  poster: React.ReactNode;
  eventId?: string;
}) {
  const { t } = useTranslation();
  const set = (patch: Partial<ContentForm>) => onChange((current) => ({ ...current, ...patch }));
  const ratingOptions = [
    { value: '', label: t('event-content:ageNotSet') },
    ...ageRatings.map((rating) => ({ value: rating, label: t(ageRatingLabelKey(rating)) })),
  ];
  return (
    <>
      {poster}
      <label>
        {t('performances:title')}
        <input
          name="title"
          value={form.title}
          maxLength={500}
          disabled={disabled}
          required
          onChange={(event) => set({ title: event.target.value })}
        />
      </label>
      <div className="performance-wide" id="event-classification">
        <ClassificationPicker
          value={{ segment: form.segment, primaryGenre: form.primaryGenre, genres: form.genres }}
          disabled={disabled}
          onChange={(next) => set(next)}
        />
      </div>
      <label className="performance-wide">
        {t('performances:descriptionOptional')}
        <textarea
          name="description"
          rows={5}
          maxLength={60_000}
          value={form.description}
          disabled={disabled}
          onChange={(event) => set({ description: event.target.value })}
        />
      </label>
      <div className="performance-wide">
        <ConcertTextFields
          translations={form.translations}
          onChange={({ translations }) => set({ translations })}
          disabled={disabled}
        />
      </div>
      <label>
        {t('event-content:ageRating')}
        <WorkspaceSelect
          label={t('event-content:ageRating')}
          value={form.ageRating}
          options={ratingOptions}
          disabled={disabled}
          onChange={(value) =>
            set({ ageRating: ageRatings.find((rating) => rating === value) ?? '' })
          }
        />
      </label>
      <label className="performance-wide">
        {t('event-content:refundPolicy')}
        <textarea
          name="refundPolicy"
          rows={3}
          maxLength={refundPolicyLimit}
          value={form.refundPolicy}
          disabled={disabled}
          aria-describedby="event-refund-help"
          onChange={(event) => set({ refundPolicy: event.target.value })}
        />
        <span id="event-refund-help" className="event-counter">
          {t('event-content:refundPolicyHelp', {
            count: form.refundPolicy.length,
            max: refundPolicyLimit,
          })}
        </span>
      </label>
      <label className="performance-wide">
        {t('event-content:artistBio')}
        <textarea
          name="artistBio"
          rows={5}
          maxLength={artistBioLimit}
          value={form.artistBio}
          disabled={disabled}
          onChange={(event) => set({ artistBio: event.target.value })}
        />
      </label>
      <EventBioGenerator
        eventId={eventId}
        currentBio={form.artistBio}
        onGenerated={(artistBio) => set({ artistBio })}
      />
    </>
  );
}

function DraftContent({
  event,
  onCreated,
  onSaved,
  onEventChange,
  onDirtyChange,
  onBusyChange,
  onReload,
}: Callbacks & {
  event?: ManagedEvent;
  onCreated?: (event: ManagedEvent) => void;
  onSaved?: (event: ManagedEvent) => void;
  onEventChange: (event: ManagedEvent) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [baseline, setBaseline] = useState(() => (event ? formFromContent(event) : emptyForm));
  const [form, setForm] = useState(baseline);
  const [pending, setPending] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const titleRef = useRef<HTMLFormElement>(null);
  const pendingUrl = useMemo(() => (pending ? URL.createObjectURL(pending) : null), [pending]);
  useEffect(() => () => void (pendingUrl && URL.revokeObjectURL(pendingUrl)), [pendingUrl]);
  const dirty = !sameContent(form, baseline) || (!event && Boolean(pending));
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    onBusyChange(true);
    setError('');
    setConflict(false);
    try {
      await task();
    } catch (failure) {
      setConflict(failure instanceof ApiClientError && failure.status === 409);
      setError(failureText(failure, t('performances:saveFailed')));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  async function posterChange(
    task: (id: string, version: number) => Promise<ContentState>,
    done: string,
  ) {
    if (!event) return;
    await run(async () => {
      const state = await task(event.id, event.contentVersion);
      onEventChange(state.event);
      toast.success(done);
    });
  }

  async function save(submit: FormEvent<HTMLFormElement>) {
    submit.preventDefault();
    if (!form.title.trim()) {
      setError(t('performances:eventTitleRequired'));
      titleRef.current?.querySelector('input')?.focus();
      return;
    }
    const body = { ...contentInput(form), ...classificationInput(form) };
    await run(async () => {
      if (event) {
        const updated = await updateManagedEvent(event.id, event.contentVersion, body);
        setBaseline(form);
        onSaved?.(updated);
        return;
      }
      const created = await createManagedEvent(body);
      if (pending) {
        try {
          await uploadEventPoster(created.id, pending, { expectedVersion: created.contentVersion });
        } catch (failure) {
          toast.error(failureText(failure, t('event-content:posterFailedAfterCreate')));
        }
      }
      setBaseline(form);
      setPending(null);
      onCreated?.(created);
    });
  }

  return (
    <section className="performance-panel performance-flow-panel">
      <p className="performance-flow-help">
        {t(event ? 'performances:eventInfoHelp' : 'performances:newEventHelp')}
      </p>
      <form
        ref={titleRef}
        className="performance-form performance-event-form"
        onSubmit={(submit) => void save(submit)}
      >
        <EventContentFields
          form={form}
          onChange={setForm}
          disabled={busy}
          eventId={event?.id}
          poster={
            <EventPosterField
              url={event ? (event.posterUrl ?? null) : pendingUrl}
              busy={busy}
              hint={event ? undefined : t('event-content:posterAfterSave')}
              onChoose={(file) =>
                event
                  ? void posterChange(
                      (id, version) => uploadEventPoster(id, file, { expectedVersion: version }),
                      t('event-content:posterSaved'),
                    )
                  : setPending(file)
              }
              onRemove={
                event || pending
                  ? () =>
                      event
                        ? void posterChange(
                            (id, version) => removeEventPoster(id, { expectedVersion: version }),
                            t('event-content:posterRemoved'),
                          )
                        : setPending(null)
                  : undefined
              }
            />
          }
        />
        {error && (
          <p className="performance-wide performance-flow-error" role="alert">
            {error}
          </p>
        )}
        <div className="performance-flow-actions performance-wide">
          {conflict && onReload && (
            <button type="button" className="button button-secondary" onClick={onReload}>
              {t('performances:reloadDraft')}
            </button>
          )}
          <button className="button button-primary" disabled={busy}>
            {t(busy ? 'performances:savingChanges' : 'performances:saveAndContinue')}
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        </div>
      </form>
    </section>
  );
}

function ReleasedContent({
  event,
  onEventChange,
  onDirtyChange,
  onBusyChange,
  onReload,
}: Callbacks & { event: ManagedEvent; onEventChange: (event: ManagedEvent) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [state, setState] = useState<ContentState | null>(null);
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ContentForm>(() => formFromContent(event));
  const [baseline, setBaseline] = useState(form);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getEventContent(event.id, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setState(result);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setLoadError(failureText(failure, t('performances:saveFailed')));
      });
    return () => controller.abort();
  }, [event.id, retry, t]);

  const live = state?.event ?? event;
  const revision: ContentRevision | null =
    state?.revision && openRevision(state.revision.state) ? state.revision : null;
  // The server counts every revision, including an approved one; editors send that number back unchanged.
  const serverRevision = state?.revision?.revision ?? 0;
  const dirty = editing && !sameContent(form, baseline);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  function apply(next: ContentState) {
    setState(next);
    onEventChange(next.event);
  }

  async function run(task: () => Promise<void>) {
    setBusy(true);
    onBusyChange(true);
    setError('');
    setConflict(false);
    try {
      await task();
    } catch (failure) {
      setConflict(failure instanceof ApiClientError && failure.status === 409);
      setError(failureText(failure, t('performances:saveFailed')));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  function startEditing() {
    const start = revision ? formFromContent(revision.content, live) : formFromContent(live);
    setForm(start);
    setBaseline(start);
    setError('');
    setEditing(true);
  }

  async function saveDraft(submit: FormEvent<HTMLFormElement>) {
    submit.preventDefault();
    if (!form.title.trim()) {
      setError(t('performances:eventTitleRequired'));
      return;
    }
    await run(async () => {
      apply(await stageContentRevision(event.id, serverRevision, revisionInput(form)));
      setEditing(false);
      toast.success(t('event-content:draftSaved'));
    });
  }

  const posterUrl = editing
    ? (revision?.posterUrl ?? live.posterUrl ?? null)
    : (live.posterUrl ?? null);
  const proposedPoster = revision?.posterUrl ?? live.posterUrl ?? null;

  if (loadError)
    return (
      <section className="performance-panel performance-flow-panel">
        <p role="alert">{loadError}</p>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => {
            setLoadError('');
            setRetry((value) => value + 1);
          }}
        >
          {t('performances:refresh')}
        </button>
      </section>
    );
  if (!state)
    return (
      <p role="status" className="performance-flow-help">
        {t('performances:loading')}
      </p>
    );

  return (
    <section className="performance-panel performance-flow-panel">
      <div className="event-content-status" data-state={revision?.state ?? 'LIVE'}>
        <p role="status">
          <strong>
            {revision ? t(revisionLabelKey(revision.state)) : t('event-content:statusLive')}
          </strong>{' '}
          {revision ? t(revisionHelpKey(revision.state)) : t('event-content:statusLiveHelp')}
        </p>
        <div className="performance-flow-actions">
          {revision?.state === 'SUBMITTED' ? (
            <button
              type="button"
              className="button button-secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  apply(await withdrawContentRevision(event.id));
                  toast.success(t('event-content:withdrawn'));
                })
              }
            >
              <Undo2 size={17} aria-hidden="true" />
              {t('event-content:withdraw')}
            </button>
          ) : (
            !editing && (
              <button type="button" className="button button-secondary" onClick={startEditing}>
                <Pencil size={17} aria-hidden="true" />
                {t(revision ? 'event-content:continueEditing' : 'event-content:editDetails')}
              </button>
            )
          )}
          {revision && !editing && (
            <Link
              className="button button-secondary"
              to={'/organizer/events/' + encodeURIComponent(event.id) + '/preview?revision=1'}
            >
              <Eye size={17} aria-hidden="true" />
              {t('event-content:previewProposed')}
            </Link>
          )}
          {revision?.state === 'DRAFTING' && !editing && (
            <button
              type="button"
              className="button button-primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  apply(await submitContentRevision(event.id, revision.revision));
                  toast.success(t('event-content:submitted'));
                })
              }
            >
              <Send size={17} aria-hidden="true" />
              {t('event-content:submitForReview')}
            </button>
          )}
          {revision && revision.state !== 'SUBMITTED' && !editing && (
            <button
              type="button"
              className="button button-secondary"
              disabled={busy}
              onClick={() => setConfirmDiscard(true)}
            >
              <Trash2 size={17} aria-hidden="true" />
              {t('event-content:discard')}
            </button>
          )}
        </div>
        {revision?.reason && (
          <p className="event-content-reason">
            {t('event-content:reviewerReason', { reason: revision.reason })}
          </p>
        )}
      </div>

      {error && !editing && (
        <p className="performance-flow-error" role="alert">
          {error}
        </p>
      )}

      {!editing && !(live.segment && live.primaryGenre) && (
        <div className="performance-feedback" role="note">
          <p>
            <strong>{t('performances:classifyPrompt')}</strong>
          </p>
          <p>{t('performances:classifyPromptHelp')}</p>
          <button type="button" className="button button-secondary" onClick={startEditing}>
            {t('performances:classificationMissing')}
          </button>
        </div>
      )}

      {!editing && (
        <>
          <div className="event-content-live">
            <h3>{t('event-content:liveVersion')}</h3>
            <p>
              <strong>{live.title}</strong>
            </p>
            {live.segment && (
              <p className="event-content-excerpt">
                {describeClassification(classificationOf(live), t)}
              </p>
            )}
            {live.description && <p className="event-content-excerpt">{live.description}</p>}
            {live.posterUrl && (
              <div className="event-poster-frame event-poster-card">
                <img src={live.posterUrl} alt="" />
              </div>
            )}
          </div>
          {revision && (
            <div className="event-content-live">
              <h3>{t('event-content:proposedVersion')}</h3>
              <p>
                <strong>{revision.content.title}</strong>
              </p>
              {revision.content.classification && (
                <p className="event-content-excerpt">
                  {describeClassification(classificationOf(revision.content, live), t)}
                </p>
              )}
              {revision.content.description && (
                <p className="event-content-excerpt">{revision.content.description}</p>
              )}
              {revision.posterChanged && proposedPoster && (
                <div className="event-poster-frame event-poster-card">
                  <img src={proposedPoster} alt="" />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {editing && (
        <form
          className="performance-form performance-event-form"
          onSubmit={(submit) => void saveDraft(submit)}
        >
          <p className="performance-flow-help performance-wide">{t('event-content:editHelp')}</p>
          <EventContentFields
            form={form}
            onChange={setForm}
            disabled={busy}
            eventId={event.id}
            poster={
              <EventPosterField
                url={posterUrl}
                busy={busy}
                hint={t('event-content:posterStagedHint')}
                onChoose={(file) =>
                  void run(async () => {
                    apply(
                      await uploadEventPoster(event.id, file, {
                        expectedRevision: serverRevision,
                      }),
                    );
                    toast.success(t('event-content:posterStaged'));
                  })
                }
                onRemove={
                  posterUrl
                    ? () =>
                        void run(async () => {
                          apply(
                            await removeEventPoster(event.id, {
                              expectedRevision: serverRevision,
                            }),
                          );
                          toast.success(t('event-content:posterRemoved'));
                        })
                    : undefined
                }
              />
            }
          />
          {error && (
            <p className="performance-wide performance-flow-error" role="alert">
              {error}
            </p>
          )}
          <div className="performance-flow-actions performance-wide">
            {conflict && onReload && (
              <button type="button" className="button button-secondary" onClick={onReload}>
                {t('performances:reloadDraft')}
              </button>
            )}
            <button
              type="button"
              className="button button-secondary"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setError('');
              }}
            >
              {t('event-content:cancelEditing')}
            </button>
            <button className="button button-primary" disabled={busy}>
              {t(busy ? 'performances:savingChanges' : 'event-content:saveRevision')}
            </button>
          </div>
        </form>
      )}

      {confirmDiscard && (
        <AdminConfirmDialog
          title={t('event-content:discardTitle')}
          description={t('event-content:discardDescription', { title: live.title })}
          confirmLabel={t('event-content:discard')}
          loading={busy}
          onClose={() => setConfirmDiscard(false)}
          onConfirm={() =>
            void run(async () => {
              apply(await discardContentRevision(event.id));
              setConfirmDiscard(false);
              toast.success(t('event-content:discarded'));
            })
          }
        />
      )}
    </section>
  );
}
