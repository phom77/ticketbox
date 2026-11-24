import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { getPublication } from '../../api/publication';
import { PublicationPanel } from '../../features/organizations/PublicationPanel';
import { useOrganization } from '../../features/organizations/OrganizationProvider';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  getAdminOrders,
  getManagedCheckinSummary,
  getManagedConcert,
  updateConcert,
  uploadConcertPoster,
  type ConcertMutation,
  type ManagementApiScope,
} from '../../api/admin';
import type { ConcertDetail } from '../../api/concerts';
import { isRequestCanceled } from '../../api/client';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { useOperationsConcert } from '../../components/layout/operationsConcertNavigation';
import { useToast } from '../../components/feedback/toast-context';
import { EventDisruptionPanel } from './EventDisruptionPanel';
import { reportReturnPath } from '../../features/operations/reportReturn';
import { ConcertArtistPanel } from './concert-workspace/ConcertArtistPanel';
import { ConcertDetailsPanel } from './concert-workspace/ConcertDetailsPanel';
import { ConcertGuestsPanel } from './concert-workspace/ConcertGuestsPanel';
import { ConcertOperationsPanel } from './concert-workspace/ConcertOperationsPanel';
import { ConcertOverviewPanel } from './concert-workspace/ConcertOverviewPanel';
import { ConcertTicketsPanel } from './concert-workspace/ConcertTicketsPanel';
import { toForm, toPayload } from './concert-workspace/concertForm';
import { useConcertArtistBio } from './concert-workspace/useConcertArtistBio';
import { useConcertGuests } from './concert-workspace/useConcertGuests';
import { useWorkspaceSection } from './concert-workspace/useWorkspaceSection';
import { dateTime, managementRoot, workspaceStatus } from './concert-workspace/workspaceFormat';
import { parseWorkspaceTab, tabs, type WorkspaceTab } from './concert-workspace/workspaceTabs';

/**
 * One concert's management workspace. Each tab renders a panel from ./concert-workspace; the
 * workspace keeps the concert, the details form and each tab's state so nothing is lost when the
 * user switches tabs.
 */
export function ConcertWorkspacePage({ apiScope = 'admin' }: { apiScope?: ManagementApiScope }) {
  useTranslation();
  const { id } = useParams();
  const organization = useOrganization();
  const canViewOrders =
    apiScope === 'admin' || !!organization?.selected?.grants.includes('FINANCE');
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const [tab, setTab] = useState<WorkspaceTab>(() => parseWorkspaceTab(searchParams.get('tab')));
  const [concert, setConcert] = useState<ConcertDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState<ConcertMutation | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingPoster, setUploadingPoster] = useState(false);

  const concertNavigation = useMemo(() => {
    if (!concert) return null;
    const root = managementRoot(apiScope);
    return {
      title: concert.title,
      concertId: concert.id,
      links: tabs.map((item) => {
        const query = new URLSearchParams(searchParams);
        if (item.id === 'overview') query.delete('tab');
        else query.set('tab', item.id);
        return {
          to: `${root}/concerts/${concert.id}${query.size ? `?${query}` : ''}`,
          get label() {
            return item.label;
          },
          icon: item.icon,
          current: item.id === parseWorkspaceTab(searchParams.get('tab')),
        };
      }),
    };
  }, [apiScope, concert, searchParams]);
  useOperationsConcert(concertNavigation);

  useEffect(() => {
    const nextTab = parseWorkspaceTab(searchParams.get('tab'));
    setTab((current) => (current === nextTab ? current : nextTab));
  }, [searchParams]);

  const selectTab = useCallback(
    (nextTab: WorkspaceTab) => {
      setTab(nextTab);
      const nextParams = new URLSearchParams(searchParams);
      if (nextTab === 'overview') nextParams.delete('tab');
      else nextParams.set('tab', nextTab);
      setSearchParams(nextParams, { preventScrollReset: true });
    },
    [searchParams, setSearchParams],
  );

  const artist = useConcertArtistBio({
    id,
    apiScope,
    enabled: tab === 'artist',
    showEditResult,
    // Runs only from a publish handler, after load below exists.
    reload: () => load(undefined, true),
  });
  const { setArtistBioDraft } = artist;

  const load = useCallback(
    async (signal?: AbortSignal, background = false) => {
      if (!id) return;
      if (!background) {
        setLoading(true);
        setError('');
      }
      try {
        const nextConcert = await getManagedConcert(id, signal, apiScope);
        if (signal?.aborted) return;
        setConcert(nextConcert);
        setForm(toForm(nextConcert));
        setArtistBioDraft(nextConcert.artistBio ?? '');
      } catch (requestError) {
        if (!background && !isRequestCanceled(requestError))
          setError(
            requestError instanceof Error
              ? requestError.message
              : translate('admin:concertWorkspacePage_khongTheTaiConcertWorkspace'),
          );
      } finally {
        if (!background && !signal?.aborted) setLoading(false);
      }
    },
    [apiScope, id, setArtistBioDraft],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const refreshAfterDisruption = useCallback(
    (signal: AbortSignal) => void load(signal, true),
    [load],
  );

  const guests = useConcertGuests(id, apiScope);
  const orderSection = useWorkspaceSection(
    !!id && canViewOrders,
    useCallback(
      (signal: AbortSignal) => getAdminOrders({ concertId: id }, apiScope, signal),
      [id, apiScope],
    ),
  );
  const checkinSection = useWorkspaceSection(
    !!id,
    useCallback(
      (signal: AbortSignal) => getManagedCheckinSummary(id!, signal, apiScope),
      [id, apiScope],
    ),
  );
  const checkin = checkinSection.data;

  const ticketStats = useMemo(
    () =>
      concert?.ticketTypes.reduce(
        (total, item) => ({
          inventory: total.inventory + item.totalQuantity,
          available: total.available + item.availableQty,
        }),
        { inventory: 0, available: 0 },
      ) ?? { inventory: 0, available: 0 },
    [concert],
  );
  const orders = orderSection.data;
  const paidOrders = orders?.filter((order) => order.status === 'PAID') ?? [];
  const revenue = paidOrders.reduce((total, order) => total + order.totalAmount, 0);

  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    if (!id || !form || !concert) return;
    setSaving(true);
    try {
      const payload = toPayload(form);
      if (concert.status !== 'DRAFT') {
        payload.eventDate = concert.eventDate;
        payload.doorsOpenAt = concert.doorsOpenAt;
        payload.saleStartAt = concert.saleStartAt;
        payload.saleEndAt = concert.saleEndAt;
      }
      const result = await updateConcert(id, payload, apiScope);
      setConcert(result.data);
      setForm(toForm(result.data));
      await showEditResult(id, 'admin:concertWorkspacePage_daLuuCauHinhConcert');
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : translate('admin:concertWorkspacePage_khongTheLuuCauHinhConcert'),
      );
    } finally {
      setSaving(false);
    }
  }

  async function replacePoster(file: File | null) {
    if (!id || !file) return;
    setUploadingPoster(true);
    try {
      const result = await uploadConcertPoster(id, file, apiScope);
      setConcert(result.data);
      await showEditResult(id, 'admin:concertWorkspacePage_daCapNhatPosterConcert');
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : translate('admin:concertWorkspacePage_khongTheTaiPosterLen'),
      );
    } finally {
      setUploadingPoster(false);
    }
  }

  async function showEditResult(concertId: string, savedMessage: string) {
    const publication =
      concert?.status === 'DRAFT'
        ? null
        : await getPublication(concertId, apiScope).catch(() => null);
    toast.success(translate(publication?.draftEdit ? 'shared:releaseStaged' : savedMessage));
    return publication?.draftEdit === true;
  }

  if (loading)
    return (
      <div className="admin-row-skeleton" aria-live="polite">
        <span />
        <span />
        <span />
      </div>
    );
  if (error || !concert || !form)
    return (
      <div className="admin-notice error">
        {error || translate('admin:concertWorkspacePage_concertKhongTonTaiHoacBanKhong')}
      </div>
    );

  const root = managementRoot(apiScope);
  const reportBack = reportReturnPath(searchParams.get('returnTo'), apiScope);

  return (
    <>
      <AdminPageHeader
        title={concert.title}
        description={`${concert.venueName} · ${dateTime.format(new Date(concert.eventDate))}`}
        actions={
          <>
            {reportBack && (
              <Link className="admin-secondary-action" to={reportBack}>
                {translate('shared:operationsReports')}
              </Link>
            )}
            <span className={`admin-status status-${concert.status.toLowerCase()}`}>
              {workspaceStatus[concert.status]}
            </span>
          </>
        }
      />

      {tab === 'overview' && id ? (
        <PublicationPanel
          key={id}
          id={id}
          scope={apiScope}
          saleStartAt={concert.saleStartAt}
          updatedAt={concert.updatedAt}
          onPublished={() => void load()}
        />
      ) : null}

      <section className="concert-workspace-hero">
        <img
          src={
            concert.posterUrl ??
            'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=900&q=80'
          }
          alt=""
        />
        <div>
          <span>{translate('admin:concertWorkspacePage_veMoBan')}</span>
          <strong>{dateTime.format(new Date(concert.saleStartAt))}</strong>
          <p>
            {concert.saleEndAt
              ? translate('admin:concertWorkspacePage_ketThucBan', {
                  arg1: dateTime.format(new Date(concert.saleEndAt)),
                })
              : translate('admin:concertWorkspacePage_banDenKhiConcertDienRa')}
          </p>
        </div>
        <div>
          <span>{translate('admin:concertWorkspacePage_trangThaiVanHanh')}</span>
          <strong>{workspaceStatus[concert.status]}</strong>
          <p>
            {ticketStats.available} / {ticketStats.inventory}{' '}
            {translate('admin:concertWorkspacePage_veConKhaDung')}
          </p>
        </div>
      </section>

      <nav
        className="concert-workspace-tabs"
        aria-label={translate('admin:concertWorkspacePage_quanLyConcert')}
      >
        {tabs
          .filter((item) => item.id !== 'artist')
          .map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={tab === item.id ? 'active' : ''}
                onClick={() => selectTab(item.id)}
              >
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
      </nav>

      {apiScope === 'admin' && tab === 'operations' && (
        <EventDisruptionPanel
          key={concert.id}
          concertId={concert.id}
          concertStatus={concert.status}
          onChanged={refreshAfterDisruption}
        />
      )}

      {tab === 'overview' ? (
        <ConcertOverviewPanel
          concert={concert}
          ticketStats={ticketStats}
          guestTotal={guests.guestTotal}
          canViewOrders={canViewOrders}
          orders={orders}
          revenue={revenue}
          checkin={checkin}
          selectTab={selectTab}
        />
      ) : null}
      {tab === 'details' ? (
        <ConcertDetailsPanel
          concert={concert}
          form={form}
          setForm={setForm}
          apiScope={apiScope}
          saving={saving}
          uploadingPoster={uploadingPoster}
          saveDetails={(event) => void saveDetails(event)}
          replacePoster={(file) => void replacePoster(file)}
        />
      ) : null}
      {tab === 'tickets' ? <ConcertTicketsPanel concert={concert} root={root} /> : null}
      {tab === 'guests' ? <ConcertGuestsPanel id={concert.id} root={root} guests={guests} /> : null}
      {tab === 'operations' ? (
        <ConcertOperationsPanel
          id={concert.id}
          root={root}
          canViewOrders={canViewOrders}
          checkinSection={checkinSection}
          orderSection={orderSection}
          paidOrders={paidOrders}
          revenue={revenue}
        />
      ) : null}
      {tab === 'artist' ? (
        <ConcertArtistPanel concert={concert} root={root} artist={artist} />
      ) : null}
    </>
  );
}
