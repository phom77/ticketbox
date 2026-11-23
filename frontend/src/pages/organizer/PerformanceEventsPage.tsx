import { WorkspaceSelect } from '../../components/WorkspaceSelect';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useBeforeUnload, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarClock, Check, FileCheck, Info, Plus, Armchair } from 'lucide-react';
import {
  createManagedEvent, getManagedEvent, listVenues, updateManagedEvent,
  type EventInput, type ManagedEvent, type ManagedPerformance, type Venue,
} from '../../api/performanceManagement';
import { ApiClientError } from '../../api/client';
import { performanceTime } from '../../features/performance/format';
import { performanceStatusKey } from './performanceSetup';
import { useOperationsConcert } from '../../components/layout/operationsConcertNavigation';
import { reportReturnPath } from '../../features/operations/reportReturn';
import { useAuth } from '../../features/auth/AuthContext';
import { RequireOrganizationGrant, useOrganization } from '../../features/organizations/OrganizationProvider';
import { PerformanceScheduleForm } from './PerformanceScheduleForm';
import { PerformanceWorkspace } from './PerformanceWorkspace';
import './PerformanceWorkspace.css';
import './PerformanceOrganizer.css';

const listPath = '/organizer/events';
const manageEventPath = (id: string) => listPath + '/' + encodeURIComponent(id);
const steps = ['event', 'schedule', 'tickets', 'review'] as const;
type Step = typeof steps[number];
const stepLabels: Record<Step, string> = {
  event: 'performances:step_event', schedule: 'performances:step_schedule',
  tickets: 'performances:step_tickets', review: 'performances:step_review',
};
const stepIcons = { event: Info, schedule: CalendarClock, tickets: Armchair, review: FileCheck };

export function PerformanceEventAccess({ children }: { children: ReactNode }) {
  const organization = useOrganization();
  return <RequireOrganizationGrant grant="EVENTS" fallback={<PerformanceEventAccessHelp />}>
    <Fragment key={organization?.selected?.id}>{children}</Fragment>
  </RequireOrganizationGrant>;
}

function PerformanceEventAccessHelp() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const organization = useOrganization();
  const navigate = useNavigate();
  const eligible = organization?.memberships.filter((membership) => membership.grants.includes('EVENTS')) ?? [];

  return <section className="admin-empty-state" aria-labelledby="performance-event-access-title">
    <h2 id="performance-event-access-title">{t('performances:organizationEventAccessRequired')}</h2>
    {organization?.error ? <>
      <p role="alert">{organization.error}</p>
      <button type="button" className="admin-secondary-action" onClick={() => void organization.reload()}>
        {t('performances:refresh')}
      </button>
    </> : eligible.length > 0 ? <>
      <p>{t('performances:chooseEventOrganization')}</p>
      <div className="forbidden-actions">
        {eligible.map((membership) => <button key={membership.id} className="admin-secondary-action" type="button"
          onClick={() => {
            organization?.choose(membership.id);
            navigate('/organizer/events');
          }}>{membership.name}</button>)}
      </div>
    </> : <>
      <p>{t('performances:organizationEventAccessHelp')}</p>
      <div className="forbidden-actions">
        <Link className="admin-secondary-action" to="/organizer">{t('shared:organizationProvider_veTongQuanToChuc')}</Link>
        {user?.role === 'ADMIN' && <Link className="admin-secondary-action" to="/admin/organizations">
          {t('performances:manageOrganizations')}
        </Link>}
      </div>
    </>}
  </section>;
}

export function NewPerformanceEventPage() {
  const { t } = useTranslation('performances');
  const navigate = useNavigate();
  const [dirty, setDirty] = useState(false);
  useDraftExit(dirty);
  const [busy, setBusy] = useState(false);

  return <div className="performance-admin performance-flow">
    <Link className="performance-flow-back" to={listPath} onClick={(click) => {
      if (busy || (dirty && !window.confirm(t('performances:leaveUnsavedStep')))) click.preventDefault();
    }}><ArrowLeft size={17} aria-hidden />{t('performances:eventList')}</Link>
    <header className="performance-flow-header"><h1>{t('performances:createConcert')}</h1></header>
    <FlowSteps step="event" canOpen={(entry) => entry === 'event'} onOpen={() => {}} />
    <EventInformationForm onDirtyChange={setDirty} onBusyChange={setBusy} onSave={async (body) => {
      const created = await createManagedEvent(body);
      setDirty(false);
      navigate(manageEventPath(created.id), { replace: true });
    }} />
  </div>;
}

export function PerformanceEventPage() {
  const { eventId } = useParams();
  return eventId ? <EventWorkspace key={eventId} id={eventId} /> : null;
}

function EventWorkspace({ id }: { id: string }) {
  const { t } = useTranslation('performances');
  const location = useLocation();
  const [event, setEvent] = useState<ManagedEvent | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('show');
  const stepValue = searchParams.get('step');
  const step = steps.find((entry) => entry === stepValue);
  const [newSchedule, setNewSchedule] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState('');
  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [venueLoadError, setVenueLoadError] = useState('');
  const [venueRetry, setVenueRetry] = useState(0);
  const stageHeading = useRef<HTMLHeadingElement>(null);
  useDraftExit(dirty);
  useEffect(() => {
    const controller = new AbortController();
    getManagedEvent(id, controller.signal).then((result) => {
      if (!controller.signal.aborted) setEvent(result);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, [id, retry]);

  useEffect(() => {
    const controller = new AbortController();
    listVenues(controller.signal).then((result) => {
      if (!controller.signal.aborted) setVenues(result);
    }).catch((failure) => {
      if (!controller.signal.aborted) setVenueLoadError(failure.message);
    });
    return () => controller.abort();
  }, [venueRetry]);

  const selected = event?.performances.find((entry) => entry.id === selectedId) ?? event?.performances[0];
  const active = newSchedule ? undefined : selected;
  const isDraft = active?.status === 'DRAFT' && !active.legacyConcertId;
  const editableEvent = event?.performances.every((entry) => entry.status === 'DRAFT' && !entry.legacyConcertId);
  const requestedStep = step ?? (active ? 'tickets' : 'schedule');
  let activeStep = requestedStep;
  if (active && ((requestedStep === 'schedule' && !isDraft) || (requestedStep === 'event' && !editableEvent))) activeStep = 'tickets';
  if (!active && (requestedStep === 'tickets' || requestedStep === 'review')) activeStep = 'schedule';

  useEffect(() => {
    if (!step) return;
    stageHeading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [step, selectedId, newSchedule]);

  const confirmLeave = useCallback(() => !busy && (!dirty || window.confirm(t('performances:leaveUnsavedStep'))), [busy, dirty, t]);

  const queryForStep = useCallback((next: Step, show?: string) => {
    const query = new URLSearchParams(searchParams);
    query.set('step', next);
    if (show) query.set('show', show);
    return query;
  }, [searchParams]);
  const setStep = useCallback((next: Step, show?: string, replace = false) => {
    setSearchParams(queryForStep(next, show), { replace, preventScrollReset: true, state: location.state });
  }, [location.state, queryForStep, setSearchParams]);

  function reloadWorkspace() {
    if (!confirmLeave()) return;
    setDirty(false);
    setError('');
    setEvent(null);
    setRetry((current) => current + 1);
  }

  function switchSchedule(next: string) {
    if (!confirmLeave()) return;
    setDirty(false);
    setRevision((current) => current + 1);
    setNewSchedule(false);
    setStep('tickets', next);
  }

  function goTo(next: Step) {
    if (next === activeStep || !confirmLeave()) return;
    if (dirty) setRevision((current) => current + 1);
    setDirty(false);
    setStep(next);
  }

  function openTickets(performance: ManagedPerformance) {
    setNewSchedule(false);
    setDirty(false);
    setStep('tickets', performance.id, true);
    setEvent((previous) => {
      if (!previous) return null;
      const entries = previous.performances;
      return {
        ...previous, performances: entries.some((entry) => entry.id === performance.id)
          ? entries.map((entry) => entry.id === performance.id ? performance : entry)
          : [...entries, performance],
      };
    });
  }

  function updatePerformance(performance: ManagedPerformance) {
    setEvent((previous) => previous && ({
      ...previous,
      performances: previous.performances.map((entry) => entry.id === performance.id ? performance : entry),
    }));
  }

  const completed = (entry: Step) => entry === 'event' || (entry === 'schedule' && Boolean(active))
    || (entry === 'tickets' && (activeStep === 'review' || Boolean(active && !isDraft)));
  function canOpen(entry: Step) {
    switch (entry) {
      case 'event': return Boolean(editableEvent);
      case 'schedule': return !active || Boolean(isDraft);
      case 'tickets': return Boolean(active);
      case 'review': return Boolean(active && !isDraft && !active.legacyConcertId);
    }
  }
  const contextualNavigation = useMemo(() => {
    if (!event) return null;
    const sections: Step[] = [];
    if (editableEvent) sections.push('event');
    if (!active || isDraft) sections.push('schedule');
    if (active) sections.push('tickets', 'review');
    return {
      title: event.title, eventId: id, performanceId: active?.id, canLeave: confirmLeave,
      links: sections.map((entry) => ({
        label: t(stepLabels[entry]),
        icon: stepIcons[entry],
        to: manageEventPath(id) + '?' + queryForStep(entry, active?.id),
        state: location.state,
        current: entry === activeStep,
        onClick: (click: React.MouseEvent<HTMLAnchorElement>) => {
          if (entry !== activeStep) {
            if (!confirmLeave()) {
              click.preventDefault();
              return;
            }
            if (dirty) setRevision((current) => current + 1);
            setDirty(false);
          }
        },
      })),
    };
  }, [event, active, activeStep, confirmLeave, dirty, editableEvent, id, isDraft, location.state, queryForStep, t]);
  useOperationsConcert(contextualNavigation);

  const directory = location.state?.directorySearch;
  const reportBack = reportReturnPath(searchParams.get('returnTo'), 'organizer');
  const back = reportBack ?? (typeof directory === 'string' && directory ? listPath + '?' + directory : listPath);
  return <div className="performance-admin performance-flow">
    <Link className="performance-flow-back" to={back} onClick={(click) => {
      if (!confirmLeave()) click.preventDefault();
    }}><ArrowLeft size={17} aria-hidden />{t(reportBack ? 'shared:operationsReports' : 'performances:eventList')}</Link>
    {!event && (error ? <section className="performance-panel">
      <p role="alert">{error}</p><button type="button" className="button button-secondary"
        onClick={reloadWorkspace}>{t('performances:refresh')}</button>
    </section> : <p role="status">{t('performances:loading')}</p>)}
    {event && <>
      <header className="performance-flow-header">
        <h1>{event.title}</h1>
        {event.performances.every((entry) => entry.status === 'DRAFT') && <span className="performance-flow-status">{t('performances:draftStatus')}</span>}
      </header>
      {event.performances.length > 0 && <section className="performance-flow-context">
        <label>{t('performances:workingPerformance')}
          <WorkspaceSelect label={t('performances:workingPerformance')} value={newSchedule ? '' : active?.id ?? ''}
            disabled={busy} onChange={switchSchedule} options={[
              ...(newSchedule ? [{ value: '', label: t('performances:newPerformance') }] : []),
              ...event.performances.map((entry) => ({
                value: entry.id, label: `${performanceTime(entry)} · ${entry.venueName} · ${t(performanceStatusKey(entry))}`,
              })),
            ]} />
        </label>
        <button type="button" disabled={busy || newSchedule} className="button button-secondary" onClick={() => {
          if (!confirmLeave()) return;
          setDirty(false);
          setRevision((current) => current + 1);
          setNewSchedule(true);
          setStep('schedule');
        }}><Plus size={17} aria-hidden />{t('performances:addPerformance')}</button>
        <p className="performance-flow-help performance-show-context-help">{t('performances:setupConcertScheduleHelp')}</p>
      </section>}
      <FlowSteps step={activeStep} canOpen={canOpen} onOpen={goTo} completed={completed} busy={busy} />
      <h2 id={activeStep === 'review' ? 'performance-review-heading' : undefined} className="performance-step-heading" ref={stageHeading} tabIndex={-1}>{t(stepLabels[activeStep])}</h2>
      {activeStep === 'event' && <EventInformationForm key={revision} initial={event}
        onDirtyChange={setDirty} onBusyChange={setBusy} onReload={reloadWorkspace} onSave={async (body) => {
          const updated = await updateManagedEvent(id, event.draftVersion, body);
          setEvent(updated);
          setDirty(false);
          setStep(active && !isDraft ? 'tickets' : 'schedule');
        }} />}
      {activeStep === 'schedule' && <PerformanceScheduleForm key={(active?.id ?? 'new') + revision}
        eventId={id} performance={active} reuseFrom={newSchedule ? selected : undefined} venues={venues} venueLoadError={venueLoadError}
        onRetryVenues={() => {
          setVenueLoadError('');
          setVenueRetry((current) => current + 1);
        }} onVenueCreated={(venue) => setVenues((current) => [...(current ?? []), venue])}
        onSave={openTickets} onDirtyChange={setDirty} onBusyChange={setBusy} onReload={reloadWorkspace} />}
      {active && (activeStep === 'tickets' || activeStep === 'review') && <PerformanceWorkspace
        key={active.id + revision} event={event} performance={active} stage={activeStep}
        venue={venues?.find((venue) => venue.spaces.some((space) => space.id === active.venueSpaceId))}
        onUpdate={updatePerformance} onDirtyChange={setDirty} onBusyChange={setBusy} onReload={reloadWorkspace}
        onReview={() => { setDirty(false); setStep('review'); }}
        onEditSchedule={isDraft ? () => goTo('schedule') : undefined}
        onEdit={() => setStep('tickets')} />}
    </>}
  </div>;
}

function FlowSteps({ step, canOpen, onOpen, completed, busy }: {
  step: Step; canOpen: (step: Step) => boolean; onOpen: (step: Step) => void;
  completed?: (step: Step) => boolean; busy?: boolean;
}) {
  const { t } = useTranslation('performances');
  return <nav className="performance-flow-progress" aria-label={t('performances:creationProgress')}>
    <ol className="performance-flow-steps">
      {steps.map((entry, index) => {
        const current = entry === step;
        const done = completed?.(entry) && !current;
        const state = done ? 'performances:setupProgressComplete' : current
          ? 'performances:setupProgressCurrent' : 'performances:setupProgressPending';
        const label = <><span className="performance-flow-step-index" aria-hidden="true">
          {done ? <Check size={15} /> : index + 1}
        </span><span>{t(stepLabels[entry])}<small id={`performance-task-status-${entry}`}>{t(state)}</small></span></>;
        return <li key={entry}>
          {canOpen(entry) && !current
            ? <button type="button" className="performance-flow-step" aria-label={t(stepLabels[entry])} aria-describedby={`performance-task-status-${entry}`} disabled={busy} onClick={() => onOpen(entry)}>{label}</button>
            : <span className="performance-flow-step" aria-current={current ? 'step' : undefined}>{label}</span>}
        </li>;
      })}
    </ol>
  </nav>;
}

function EventInformationForm({ initial, onSave, onDirtyChange, onBusyChange, onReload }: {
  initial?: ManagedEvent; onSave: (body: EventInput) => Promise<void>; onReload?: () => void;
  onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void;
}) {
  const { t } = useTranslation('performances');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const title = String(values.get('title')).trim();
    if (!title) {
      setError(t('performances:eventTitleRequired'));
      event.currentTarget.querySelector('input')?.focus();
      return;
    }
    setBusy(true);
    onBusyChange(true);
    setError('');
    setConflict(false);
    try {
      await onSave({ title, description: String(values.get('description')).trim(), category: String(values.get('category')).trim() || null });
    } catch (failure) {
      setConflict(failure instanceof ApiClientError && failure.status === 409);
      setError(failure instanceof Error ? failure.message : t('performances:saveFailed'));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  return <section className="performance-panel performance-flow-panel">
    <p className="performance-flow-help">{t(initial ? 'eventInfoHelp' : 'newEventHelp')}</p>
    <form className="performance-form performance-event-form" onSubmit={(event) => void save(event)} onChange={() => onDirtyChange(true)}>
      <label>{t('performances:title')}<input name="title" defaultValue={initial?.title} maxLength={500} disabled={busy} required /></label>
      <label>{t('performances:categoryOptional')}<input name="category" defaultValue={initial?.category ?? ''} maxLength={100} disabled={busy} /></label>
      <label className="performance-wide">{t('performances:descriptionOptional')}<textarea name="description" rows={5} maxLength={60_000} defaultValue={initial?.description ?? ''} disabled={busy} /></label>
      {error && <p className="performance-wide performance-flow-error" role="alert">{error}</p>}
      <div className="performance-flow-actions performance-wide">
        {conflict && onReload && <button type="button" className="button button-secondary" onClick={onReload}>
          {t('performances:reloadDraft')}
        </button>}
        <button className="button button-primary" disabled={busy}>{t(busy ? 'savingChanges' : 'saveAndContinue')}<ArrowRight size={17} aria-hidden /></button>
      </div>
    </form>
  </section>;
}

function useDraftExit(dirty: boolean) {
  useBeforeUnload(useCallback((event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = true;
  }, [dirty]));
}
