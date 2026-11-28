import { WorkspaceSelect } from '../../components/WorkspaceSelect';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Link,
  useBeforeUnload,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import {
  ArrowLeft,
  CalendarClock,
  Check,
  Copy,
  Eye,
  FileCheck,
  Info,
  Plus,
  Armchair,
  Trash2,
  Users,
} from 'lucide-react';
import {
  deleteDraftEvent,
  deleteDraftPerformance,
  getManagedEvent,
  listVenues,
  type ManagedEvent,
  type ManagedPerformance,
  type Venue,
} from '../../api/performanceManagement';
import { AdminConfirmDialog } from '../../components/admin/AdminConfirmDialog';
import { AddDatesDialog } from './scheduling/AddDatesDialog';
import { ApplyPricingDialog } from './scheduling/ApplyPricingDialog';
import { DuplicateDialog } from './scheduling/DuplicateDialog';
import { PerformanceSalesPanel } from './scheduling/PerformanceSalesPanel';
import { VenueLibraryDialog } from './scheduling/VenueLibraryDialog';
import { useToast } from '../../components/feedback/toast-context';
import { performanceTime } from '../../features/performance/format';
import { performanceStatusKey } from './performanceSetup';
import { useOperationsConcert } from '../../components/layout/operationsConcertNavigation';
import { reportReturnPath } from '../../features/operations/reportReturn';
import { useAuth } from '../../features/auth/AuthContext';
import {
  RequireOrganizationGrant,
  useOrganization,
} from '../../features/organizations/OrganizationProvider';
import { EventDetailsStep } from './EventDetailsStep';
import { LegacyConcertSummary } from './LegacyConcertSummary';
import { PerformanceGuests } from './PerformanceGuests';
import { PerformanceScheduleForm } from './PerformanceScheduleForm';
import { PerformanceWorkspace } from './PerformanceWorkspace';
import './PerformanceWorkspace.css';
import './PerformanceOrganizer.css';

const listPath = '/organizer/events';
const manageEventPath = (id: string) => listPath + '/' + encodeURIComponent(id);
const steps = ['event', 'schedule', 'tickets', 'review', 'guests'] as const;
type Step = (typeof steps)[number];
const stepLabels: Record<Step, string> = {
  event: 'performances:step_event',
  schedule: 'performances:step_schedule',
  tickets: 'performances:step_tickets',
  review: 'performances:step_review',
  guests: 'event-content:stepGuests',
};
const stepIcons = {
  event: Info,
  schedule: CalendarClock,
  tickets: Armchair,
  review: FileCheck,
  guests: Users,
};

export function PerformanceEventAccess({ children }: { children: ReactNode }) {
  const organization = useOrganization();
  return (
    <RequireOrganizationGrant grant="EVENTS" fallback={<PerformanceEventAccessHelp />}>
      <Fragment key={organization?.selected?.id}>{children}</Fragment>
    </RequireOrganizationGrant>
  );
}

function PerformanceEventAccessHelp() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const organization = useOrganization();
  const navigate = useNavigate();
  const eligible =
    organization?.memberships.filter((membership) => membership.grants.includes('EVENTS')) ?? [];

  return (
    <section className="admin-empty-state" aria-labelledby="performance-event-access-title">
      <h2 id="performance-event-access-title">
        {t('performances:organizationEventAccessRequired')}
      </h2>
      {organization?.error ? (
        <>
          <p role="alert">{organization.error}</p>
          <button
            type="button"
            className="admin-secondary-action"
            onClick={() => void organization.reload()}
          >
            {t('performances:refresh')}
          </button>
        </>
      ) : eligible.length > 0 ? (
        <>
          <p>{t('performances:chooseEventOrganization')}</p>
          <div className="forbidden-actions">
            {eligible.map((membership) => (
              <button
                key={membership.id}
                className="admin-secondary-action"
                type="button"
                onClick={() => {
                  organization?.choose(membership.id);
                  navigate('/organizer/events');
                }}
              >
                {membership.name}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p>{t('performances:organizationEventAccessHelp')}</p>
          <div className="forbidden-actions">
            <Link className="admin-secondary-action" to="/organizer">
              {t('shared:organizationProvider_veTongQuanToChuc')}
            </Link>
            {user?.role === 'ADMIN' && (
              <Link className="admin-secondary-action" to="/admin/organizations">
                {t('performances:manageOrganizations')}
              </Link>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export function NewPerformanceEventPage() {
  const { t } = useTranslation('performances');
  const navigate = useNavigate();
  const [dirty, setDirty] = useState(false);
  useDraftExit(dirty);
  const [busy, setBusy] = useState(false);

  return (
    <div className="performance-admin performance-flow">
      <Link
        className="performance-flow-back"
        to={listPath}
        onClick={(click) => {
          if (busy || (dirty && !window.confirm(t('performances:leaveUnsavedStep'))))
            click.preventDefault();
        }}
      >
        <ArrowLeft size={17} aria-hidden />
        {t('performances:eventList')}
      </Link>
      <header className="performance-flow-header">
        <h1>{t('performances:createConcert')}</h1>
      </header>
      <FlowSteps step="event" canOpen={(entry) => entry === 'event'} onOpen={() => {}} />
      <EventDetailsStep
        released={false}
        onDirtyChange={setDirty}
        onBusyChange={setBusy}
        onEventChange={() => undefined}
        onCreated={(created) => {
          setDirty(false);
          navigate(manageEventPath(created.id), { replace: true });
        }}
      />
    </div>
  );
}

export function PerformanceEventPage() {
  const { eventId } = useParams();
  return eventId ? <EventWorkspace key={eventId} id={eventId} /> : null;
}

function EventWorkspace({ id }: { id: string }) {
  const { t } = useTranslation('performances');
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [deleting, setDeleting] = useState<'performance' | 'event' | null>(null);
  const [schedulingDialog, setSchedulingDialog] = useState<
    'add' | 'duplicate' | 'apply' | 'venues' | null
  >(null);
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
    getManagedEvent(id, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setEvent(result);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => controller.abort();
  }, [id, retry]);

  useEffect(() => {
    const controller = new AbortController();
    listVenues(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setVenues(result);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setVenueLoadError(failure.message);
      });
    return () => controller.abort();
  }, [venueRetry]);

  const selected =
    event?.performances.find((entry) => entry.id === selectedId) ?? event?.performances[0];
  const active = newSchedule ? undefined : selected;
  const isDraft = active?.status === 'DRAFT' && !active.legacyConcertId;
  const legacyConcert = Boolean(active?.legacyConcertId);
  const allDrafts = event?.performances.every(
    (entry) => entry.status === 'DRAFT' && !entry.legacyConcertId,
  );
  const applyTargets = (event?.performances ?? []).filter(
    (entry) => entry.id !== active?.id && entry.status === 'DRAFT' && !entry.legacyConcertId,
  );
  const released = Boolean(event?.performances.some((entry) => entry.status !== 'DRAFT'));
  const requestedStep = step ?? (active ? 'tickets' : 'schedule');
  let activeStep = requestedStep;
  if (active && requestedStep === 'schedule' && !isDraft) activeStep = 'tickets';
  if (
    !active &&
    (requestedStep === 'tickets' || requestedStep === 'review' || requestedStep === 'guests')
  )
    activeStep = 'schedule';

  useEffect(() => {
    if (!step) return;
    stageHeading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [step, selectedId, newSchedule]);

  const confirmLeave = useCallback(
    () => !busy && (!dirty || window.confirm(t('performances:leaveUnsavedStep'))),
    [busy, dirty, t],
  );

  const queryForStep = useCallback(
    (next: Step, show?: string) => {
      const query = new URLSearchParams(searchParams);
      query.set('step', next);
      if (show) query.set('show', show);
      return query;
    },
    [searchParams],
  );
  const setStep = useCallback(
    (next: Step, show?: string, replace = false) => {
      setSearchParams(queryForStep(next, show), {
        replace,
        preventScrollReset: true,
        state: location.state,
      });
    },
    [location.state, queryForStep, setSearchParams],
  );

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
        ...previous,
        performances: entries.some((entry) => entry.id === performance.id)
          ? entries.map((entry) => (entry.id === performance.id ? performance : entry))
          : [...entries, performance],
      };
    });
  }

  /** Reloads the event after dates were added or copied and opens the first new date. */
  function afterDatesChanged(message: string, show?: string) {
    setSchedulingDialog(null);
    setDirty(false);
    toast.success(message);
    setEvent(null);
    setRetry((current) => current + 1);
    if (show) setStep('tickets', show);
  }

  function updatePerformance(performance: ManagedPerformance) {
    setEvent(
      (previous) =>
        previous && {
          ...previous,
          performances: previous.performances.map((entry) =>
            entry.id === performance.id ? performance : entry,
          ),
        },
    );
  }

  const completed = (entry: Step) =>
    entry === 'event' ||
    (entry === 'schedule' && Boolean(active)) ||
    (entry === 'tickets' && (activeStep === 'review' || Boolean(active && !isDraft)));
  function canOpen(entry: Step) {
    switch (entry) {
      case 'event':
        return true;
      case 'schedule':
        return !active || Boolean(isDraft);
      case 'tickets':
      case 'guests':
        return Boolean(active);
      case 'review':
        return Boolean(active && !isDraft && !active.legacyConcertId);
    }
  }
  const contextualNavigation = useMemo(() => {
    if (!event) return null;
    if (legacyConcert)
      return { title: event.title, eventId: id, performanceId: active?.id, links: [] };
    const sections: Step[] = ['event'];
    if (!active || isDraft) sections.push('schedule');
    if (active) sections.push('tickets', 'review', 'guests');
    return {
      title: event.title,
      eventId: id,
      performanceId: active?.id,
      canLeave: confirmLeave,
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
  }, [
    event,
    active,
    activeStep,
    confirmLeave,
    dirty,
    legacyConcert,
    id,
    isDraft,
    location.state,
    queryForStep,
    t,
  ]);
  useOperationsConcert(contextualNavigation);

  async function confirmDelete() {
    if (!event || !deleting) return;
    setBusy(true);
    try {
      if (deleting === 'event') {
        await deleteDraftEvent(id, event.draftVersion);
        setDirty(false);
        toast.success(t('event-content:eventDeleted', { title: event.title }));
        navigate(listPath, { replace: true });
        return;
      }
      if (!active) return;
      await deleteDraftPerformance(active.id, active.draftVersion);
      toast.success(t('event-content:draftDeleted'));
      setDeleting(null);
      setDirty(false);
      setSearchParams(new URLSearchParams({ step: 'tickets' }), { replace: true });
      setEvent(null);
      setRetry((current) => current + 1);
    } catch (failure) {
      setDeleting(null);
      toast.error(failure instanceof Error ? failure.message : t('performances:saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  const directory = location.state?.directorySearch;
  const reportBack = reportReturnPath(searchParams.get('returnTo'), 'organizer');
  const back =
    reportBack ??
    (typeof directory === 'string' && directory ? listPath + '?' + directory : listPath);
  return (
    <div className="performance-admin performance-flow">
      <Link
        className="performance-flow-back"
        to={back}
        onClick={(click) => {
          if (!confirmLeave()) click.preventDefault();
        }}
      >
        <ArrowLeft size={17} aria-hidden />
        {t(reportBack ? 'shared:operationsReports' : 'performances:eventList')}
      </Link>
      {!event &&
        (error ? (
          <section className="performance-panel">
            <p role="alert">{error}</p>
            <button type="button" className="button button-secondary" onClick={reloadWorkspace}>
              {t('performances:refresh')}
            </button>
          </section>
        ) : (
          <p role="status">{t('performances:loading')}</p>
        ))}
      {event && legacyConcert && active && (
        <>
          <header className="performance-flow-header">
            <h1>{event.title}</h1>
            <span className="performance-flow-status">{t('event-content:legacyBadge')}</span>
          </header>
          <LegacyConcertSummary eventId={id} performance={active} title={event.title} />
        </>
      )}
      {event && !legacyConcert && (
        <>
          <header className="performance-flow-header">
            <h1>{event.title}</h1>
            {!released && (
              <span className="performance-flow-status">{t('performances:draftStatus')}</span>
            )}
            <div className="performance-flow-actions">
              <Link
                className="button button-secondary"
                to={manageEventPath(id) + '/preview' + (active ? '?performance=' + active.id : '')}
                onClick={(click) => {
                  if (!confirmLeave()) click.preventDefault();
                }}
              >
                <Eye size={17} aria-hidden="true" />
                {t('event-content:preview')}
              </Link>
              {allDrafts && (
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => setDeleting('event')}
                >
                  <Trash2 size={17} aria-hidden="true" />
                  {t('event-content:deleteEvent')}
                </button>
              )}
            </div>
          </header>
          {event.performances.length > 0 && (
            <section className="performance-flow-context">
              <label>
                {t('performances:workingPerformance')}
                <WorkspaceSelect
                  label={t('performances:workingPerformance')}
                  value={newSchedule ? '' : (active?.id ?? '')}
                  disabled={busy}
                  onChange={switchSchedule}
                  options={[
                    ...(newSchedule
                      ? [{ value: '', label: t('performances:newPerformance') }]
                      : []),
                    ...event.performances.map((entry) => ({
                      value: entry.id,
                      label: `${performanceTime(entry)} · ${entry.venueName} · ${t(performanceStatusKey(entry))}`,
                    })),
                  ]}
                />
              </label>
              <button
                type="button"
                disabled={busy || newSchedule}
                className="button button-secondary"
                onClick={() => {
                  if (!confirmLeave()) return;
                  setDirty(false);
                  setRevision((current) => current + 1);
                  setNewSchedule(true);
                  setStep('schedule');
                }}
              >
                <Plus size={17} aria-hidden="true" />
                {t('performances:addPerformance')}
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={busy || !venues}
                onClick={() => setSchedulingDialog('add')}
              >
                <CalendarClock size={17} aria-hidden="true" />
                {t('scheduling:addDates')}
              </button>
              {active && !newSchedule && (
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => setSchedulingDialog('duplicate')}
                >
                  <Copy size={17} aria-hidden="true" />
                  {t('scheduling:duplicate')}
                </button>
              )}
              {active && !newSchedule && applyTargets.length > 0 && (
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => setSchedulingDialog('apply')}
                >
                  {t('scheduling:applyPricing')}
                </button>
              )}
              <button
                type="button"
                className="button button-secondary"
                disabled={busy || !venues}
                onClick={() => setSchedulingDialog('venues')}
              >
                {t('scheduling:manageVenues')}
              </button>
              {isDraft && !newSchedule && (
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => setDeleting('performance')}
                >
                  <Trash2 size={17} aria-hidden="true" />
                  {t('event-content:deleteDraft')}
                </button>
              )}
              <p className="performance-flow-help performance-show-context-help">
                {t('performances:setupConcertScheduleHelp')}
              </p>
            </section>
          )}
          <FlowSteps
            step={activeStep}
            canOpen={canOpen}
            onOpen={goTo}
            completed={completed}
            busy={busy}
          />
          <h2
            id={activeStep === 'review' ? 'performance-review-heading' : undefined}
            className="performance-step-heading"
            ref={stageHeading}
            tabIndex={-1}
          >
            {t(stepLabels[activeStep])}
          </h2>
          {activeStep === 'event' && (
            <EventDetailsStep
              key={revision}
              event={event}
              released={released}
              onDirtyChange={setDirty}
              onBusyChange={setBusy}
              onReload={reloadWorkspace}
              onEventChange={(updated) =>
                setEvent((previous) => previous && { ...previous, ...updated })
              }
              onSaved={(updated) => {
                setEvent(updated);
                setDirty(false);
                setStep(active && !isDraft ? 'tickets' : 'schedule');
              }}
            />
          )}
          {activeStep === 'schedule' && (
            <PerformanceScheduleForm
              key={(active?.id ?? 'new') + revision}
              eventId={id}
              performance={active}
              reuseFrom={newSchedule ? selected : undefined}
              venues={venues}
              venueLoadError={venueLoadError}
              onRetryVenues={() => {
                setVenueLoadError('');
                setVenueRetry((current) => current + 1);
              }}
              onVenueCreated={(venue) => setVenues((current) => [...(current ?? []), venue])}
              onSave={openTickets}
              onDirtyChange={setDirty}
              onBusyChange={setBusy}
              onReload={reloadWorkspace}
            />
          )}
          {active && (activeStep === 'tickets' || activeStep === 'review') && (
            <PerformanceWorkspace
              key={active.id + revision}
              event={event}
              performance={active}
              stage={activeStep}
              venue={venues?.find((venue) =>
                venue.spaces.some((space) => space.id === active.venueSpaceId),
              )}
              onUpdate={updatePerformance}
              onDirtyChange={setDirty}
              onBusyChange={setBusy}
              onReload={reloadWorkspace}
              onReview={() => {
                setDirty(false);
                setStep('review');
              }}
              onEditSchedule={isDraft ? () => goTo('schedule') : undefined}
              onEditEvent={() => goTo('event')}
              onEdit={() => setStep('tickets')}
            />
          )}
          {active && !isDraft && !legacyConcert && activeStep !== 'event' && (
            <PerformanceSalesPanel key={active.id + revision} performance={active} />
          )}
          {active && activeStep === 'guests' && (
            <PerformanceGuests
              key={active.id}
              performanceId={active.id}
              label={`${event.title} · ${performanceTime(active)}`}
              released={!isDraft}
              reviewPath={manageEventPath(id) + '?' + queryForStep('review', active.id)}
            />
          )}
          {schedulingDialog === 'add' && venues && (
            <AddDatesDialog
              eventId={id}
              performances={event.performances}
              venues={venues}
              defaultSource={active}
              onClose={() => setSchedulingDialog(null)}
              onDone={(created) =>
                afterDatesChanged(
                  t('scheduling:datesAdded', { count: created.length }),
                  created[0]?.id,
                )
              }
            />
          )}
          {schedulingDialog === 'duplicate' && active && (
            <DuplicateDialog
              performance={active}
              onClose={() => setSchedulingDialog(null)}
              onDone={(copy) => afterDatesChanged(t('scheduling:duplicated'), copy.id)}
            />
          )}
          {schedulingDialog === 'apply' && active && (
            <ApplyPricingDialog
              source={active}
              candidates={applyTargets}
              onClose={() => setSchedulingDialog(null)}
              onDone={(count) => afterDatesChanged(t('scheduling:pricingApplied', { count }))}
            />
          )}
          {schedulingDialog === 'venues' && venues && (
            <VenueLibraryDialog
              venues={venues}
              onClose={() => setSchedulingDialog(null)}
              onChange={(venue) =>
                setVenues((current) =>
                  (current ?? []).some((entry) => entry.id === venue.id)
                    ? (current ?? []).map((entry) => (entry.id === venue.id ? venue : entry))
                    : [...(current ?? []), venue],
                )
              }
            />
          )}
          {deleting && (
            <AdminConfirmDialog
              title={t(
                deleting === 'event'
                  ? 'event-content:deleteEventTitle'
                  : 'event-content:deleteDraftTitle',
              )}
              description={
                deleting === 'event'
                  ? t('event-content:deleteEventDescription', { title: event.title })
                  : t('event-content:deleteDraftDescription', {
                      title: event.title,
                      when: active ? performanceTime(active) : '',
                    })
              }
              confirmLabel={t(
                deleting === 'event' ? 'event-content:deleteEvent' : 'event-content:deleteDraft',
              )}
              loading={busy}
              onClose={() => setDeleting(null)}
              onConfirm={() => void confirmDelete()}
            />
          )}
        </>
      )}
    </div>
  );
}

function FlowSteps({
  step,
  canOpen,
  onOpen,
  completed,
  busy,
}: {
  step: Step;
  canOpen: (step: Step) => boolean;
  onOpen: (step: Step) => void;
  completed?: (step: Step) => boolean;
  busy?: boolean;
}) {
  const { t } = useTranslation('performances');
  return (
    <nav className="performance-flow-progress" aria-label={t('performances:creationProgress')}>
      <ol className="performance-flow-steps">
        {steps.map((entry, index) => {
          const current = entry === step;
          const done = completed?.(entry) && !current;
          const state = done
            ? 'performances:setupProgressComplete'
            : current
              ? 'performances:setupProgressCurrent'
              : 'performances:setupProgressPending';
          const label = (
            <>
              <span className="performance-flow-step-index" aria-hidden="true">
                {done ? <Check size={15} /> : index + 1}
              </span>
              <span>
                {t(stepLabels[entry])}
                <small id={`performance-task-status-${entry}`}>{t(state)}</small>
              </span>
            </>
          );
          return (
            <li key={entry}>
              {canOpen(entry) && !current ? (
                <button
                  type="button"
                  className="performance-flow-step"
                  aria-label={t(stepLabels[entry])}
                  aria-describedby={`performance-task-status-${entry}`}
                  disabled={busy}
                  onClick={() => onOpen(entry)}
                >
                  {label}
                </button>
              ) : (
                <span className="performance-flow-step" aria-current={current ? 'step' : undefined}>
                  {label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function useDraftExit(dirty: boolean) {
  useBeforeUnload(
    useCallback(
      (event) => {
        if (!dirty) return;
        event.preventDefault();
        event.returnValue = true;
      },
      [dirty],
    ),
  );
}
