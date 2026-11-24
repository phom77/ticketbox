import { useEffect, useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { getAdmissionStaff, type AdmissionStaff } from '../../api/organizations';
import {
  assignPerformanceStaff,
  listPerformanceStaff,
  revokePerformanceStaff,
  type PerformanceStaff,
} from '../../api/performanceManagement';
import { WorkspaceSelect } from '../../components/WorkspaceSelect';
import { useOrganization } from '../../features/organizations/OrganizationProvider';

export function PerformanceStaffPanel({ id }: { id: string }) {
  const organizationId = useOrganization()?.selected?.id;
  if (!organizationId) return null;
  return (
    <StaffAssignments key={`${organizationId}:${id}`} id={id} organizationId={organizationId} />
  );
}

function StaffAssignments({ id, organizationId }: { id: string; organizationId: string }) {
  const { t } = useTranslation();
  const headingId = useId();
  const [entries, setEntries] = useState<PerformanceStaff[] | null>(null);
  const [directory, setDirectory] = useState<AdmissionStaff[] | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [listFailed, setListFailed] = useState(false);
  const [directoryFailed, setDirectoryFailed] = useState(false);
  const [changeFailed, setChangeFailed] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void listPerformanceStaff(id, controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) setEntries(rows);
      })
      .catch(() => {
        if (!controller.signal.aborted) setListFailed(true);
      });
    void getAdmissionStaff(organizationId, controller.signal)
      .then((staff) => {
        if (!controller.signal.aborted) setDirectory(staff);
      })
      .catch(() => {
        if (!controller.signal.aborted) setDirectoryFailed(true);
      });

    return () => controller.abort();
  }, [id, organizationId, revision]);

  const staffById = new Map(directory?.map((staff) => [staff.accountId, staff]));
  const assignedIds = new Set(entries?.map((entry) => entry.staffId));
  const available = directory?.filter((staff) => !assignedIds.has(staff.accountId)) ?? [];
  const term = query.trim().toLowerCase();
  const matching = available.filter(
    ({ fullName, email }) =>
      fullName.toLowerCase().includes(term) || email.toLowerCase().includes(term),
  );

  async function apply(staffId: string, grant: boolean) {
    setBusy(true);
    setChangeFailed(false);
    try {
      if (grant) await assignPerformanceStaff(id, staffId);
      else await revokePerformanceStaff(id, staffId);
      setEntries(await listPerformanceStaff(id));
      if (grant) {
        setSelected('');
        setQuery('');
      }
    } catch {
      setChangeFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (matching.some(({ accountId }) => accountId === selected)) void apply(selected, true);
  }

  return (
    <section className="performance-panel" aria-labelledby={headingId}>
      <h2 id={headingId}>{t('performances:staff')}</h2>
      {changeFailed && <p role="alert">{t('performances:saveFailed')}</p>}
      {listFailed && <p role="alert">{t('performances:staffAssignmentsFailed')}</p>}
      {directoryFailed && <p role="alert">{t('performances:staffDirectoryFailed')}</p>}
      {(listFailed || directoryFailed) && (
        <button
          type="button"
          className="button button-secondary"
          disabled={busy}
          onClick={() => {
            setListFailed(false);
            setDirectoryFailed(false);
            setRevision((current) => current + 1);
          }}
        >
          {t('performances:refresh')}
        </button>
      )}
      {((!entries && !listFailed) || (!directory && !directoryFailed)) && (
        <p role="status">{t('performances:staffLoading')}</p>
      )}
      {entries?.length ? (
        <ul className="performance-list">
          {entries.map((entry) => {
            const staff = staffById.get(entry.staffId);
            return (
              <li className="performance-show" key={entry.staffId}>
                <div>
                  <strong>{staff?.fullName ?? t('performances:staffUnavailable')}</strong>
                  {staff && <p>{staff.email}</p>}
                </div>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => void apply(entry.staffId, false)}
                >
                  {t('performances:revokeStaff')}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {entries &&
        directory &&
        (available.length ? (
          <form className="performance-form" onSubmit={submit}>
            <label>
              {t('performances:staffSearch')}
              <input
                type="search"
                value={query}
                disabled={busy}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelected('');
                }}
              />
            </label>
            <label>
              {t('performances:staffAccount')}
              <WorkspaceSelect
                label={t('performances:staffAccount')}
                value={selected}
                disabled={busy}
                placeholder={t(
                  matching.length ? 'performances:staffChoose' : 'performances:staffNoMatches',
                )}
                onChange={setSelected}
                options={matching.map(({ accountId, fullName, email }) => ({
                  value: accountId,
                  label: `${fullName} · ${email}`,
                }))}
              />
            </label>
            <button className="button button-primary" disabled={busy || !selected}>
              {t('performances:assignStaff')}
            </button>
          </form>
        ) : (
          <p>{t('performances:staffNoCandidates')}</p>
        ))}
    </section>
  );
}
