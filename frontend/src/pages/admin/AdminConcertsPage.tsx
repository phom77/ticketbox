import { WorkspaceSelect } from '../../components/WorkspaceSelect';
import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Plus, RefreshCw, Search } from 'lucide-react';
import { deleteConcert, updateConcertStatus, type ManagementApiScope } from '../../api/admin';
import type { ConcertDetail, ConcertStatus } from '../../api/concerts';
import { AdminConfirmDialog } from '../../components/admin/AdminConfirmDialog';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { useToast } from '../../components/feedback/toast-context';
import { ConcertForm } from './concerts/ConcertForm';
import { ConcertTable } from './concerts/ConcertTable';
import { statusLabel, statuses, transitions } from './concerts/concertStatus';
import { useConcertEditor } from './concerts/useConcertEditor';
import { useManagedConcerts } from './concerts/useManagedConcerts';

/**
 * The concert list for admins and organizers: search, status changes, deletion of drafts and the
 * create/edit dialog. The pieces live in ./concerts.
 */
export function AdminConcertsPage({ apiScope = 'admin' }: { apiScope?: ManagementApiScope }) {
  useTranslation();
  const toast = useToast();
  const {
    pageData,
    setPage,
    status,
    setStatus,
    query,
    setQuery,
    loading,
    error,
    checkinSummaries,
    loadConcerts,
  } = useManagedConcerts(apiScope);
  const {
    editing,
    formOpen,
    form,
    setForm,
    organizations,
    owner,
    setOwner,
    organizationsError,
    posterFile,
    saving,
    removingPoster,
    canSaveOwner,
    openCreate,
    openEdit,
    closeForm,
    submitForm,
    choosePoster,
    removePoster,
  } = useConcertEditor({ apiScope, loadConcerts: () => loadConcerts() });
  const [deleteTarget, setDeleteTarget] = useState<ConcertDetail | null>(null);
  const [busyId, setBusyId] = useState('');

  const availableTransitions = (concert: ConcertDetail) =>
    transitions[concert.status].filter((next) => apiScope === 'admin' || next !== 'CANCELLED');

  async function changeStatus(concert: ConcertDetail, next: ConcertStatus) {
    setBusyId(concert.id);
    try {
      await updateConcertStatus(concert.id, next, apiScope);
      toast.success(
        translate('admin:adminConcertsPage_daChuyenSang', {
          arg1: concert.title,
          arg2: statusLabel(next),
        }),
      );
      await loadConcerts();
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : translate('admin:adminConcertsPage_khongTheDoiTrangThaiConcert'),
      );
    } finally {
      setBusyId('');
    }
  }

  async function removeConcert() {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await deleteConcert(deleteTarget.id, apiScope);
      toast.success(translate('admin:adminConcertsPage_daXoaConcert'));
      setDeleteTarget(null);
      await loadConcerts();
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : translate('admin:adminConcertsPage_chiConcertBanNhapMoiCoThe'),
      );
    } finally {
      setBusyId('');
    }
  }

  return (
    <>
      <AdminPageHeader
        title={translate('admin:adminConcertsPage_quanLyConcert')}
        actions={
          <button className="admin-primary-action" type="button" onClick={openCreate}>
            <Plus aria-hidden="true" size={17} />
            {translate('admin:adminConcertsPage_taoConcert')}
          </button>
        }
      />

      <section
        className="admin-inline-stats"
        aria-label={translate('admin:adminConcertsPage_tomTatConcert')}
      >
        <div>
          <span>{translate('admin:adminConcertsPage_buoiDienPhuHop')}</span>
          <strong>{pageData?.totalElements ?? '—'}</strong>
        </div>
      </section>

      <div className="admin-toolbar">
        <label className="admin-search-control">
          <Search aria-hidden="true" size={16} />
          <span className="sr-only">{translate('admin:adminConcertsPage_timConcert')}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            placeholder={translate('admin:adminConcertsPage_timConcertDiaDiem')}
          />
        </label>
        <label>
          <span className="sr-only">{translate('admin:adminConcertsPage_locTheoTrangThai')}</span>
          <WorkspaceSelect
            label={translate('admin:adminConcertsPage_locTheoTrangThai')}
            value={status}
            options={statuses}
            onChange={(value) => {
              setStatus(value as '' | ConcertStatus);
              setPage(0);
            }}
          />
        </label>
        <button type="button" onClick={() => void loadConcerts()} disabled={loading}>
          <RefreshCw aria-hidden="true" size={16} />
          {translate('admin:adminConcertsPage_lamMoi')}
        </button>
      </div>

      {error ? (
        <div className="admin-notice error" role="alert">
          {error}
        </div>
      ) : null}

      <ConcertTable
        apiScope={apiScope}
        pageData={pageData}
        loading={loading}
        query={query}
        checkinSummaries={checkinSummaries}
        busyId={busyId}
        availableTransitions={availableTransitions}
        changeStatus={(concert, next) => void changeStatus(concert, next)}
        openCreate={openCreate}
        openEdit={openEdit}
        setDeleteTarget={setDeleteTarget}
        setPage={setPage}
      />

      {formOpen ? (
        <ConcertForm
          form={form}
          editing={editing}
          saving={saving}
          canSave={canSaveOwner}
          removingPoster={removingPoster}
          posterFile={posterFile}
          onChange={setForm}
          onPosterChange={choosePoster}
          onRemovePoster={() => void removePoster()}
          onClose={closeForm}
          onSubmit={(event) => void submitForm(event)}
          ownerField={
            apiScope === 'admin' && !editing ? (
              <label className="admin-field admin-field-wide">
                {translate('shared:partnerAssistedOwner')}
                <WorkspaceSelect
                  label={translate('shared:partnerAssistedOwner')}
                  value={owner}
                  onChange={setOwner}
                  options={[
                    { value: '', label: 'TicketBox' },
                    ...organizations.map(({ id, name }) => ({ value: id, label: name })),
                  ]}
                />
                {!canSaveOwner && (
                  <small>{translate('concert-directory:chooseApprovedOwner')}</small>
                )}
                {organizationsError ? <span role="alert">{organizationsError}</span> : null}
              </label>
            ) : null
          }
        />
      ) : null}

      {deleteTarget ? (
        <AdminConfirmDialog
          title={translate('admin:adminConcertsPage_xoaConcert', { arg1: deleteTarget.title })}
          description={translate('admin:adminConcertsPage_concertBanNhapVaToanBoCau')}
          confirmLabel={translate('admin:adminConcertsPage_xoaConcert_2')}
          loading={busyId === deleteTarget.id}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => void removeConcert()}
        />
      ) : null}
    </>
  );
}
