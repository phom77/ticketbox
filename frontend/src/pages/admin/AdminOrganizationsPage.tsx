import { WorkspaceSelect } from '../../components/WorkspaceSelect';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  approveOrganizerApplication, createPartnerLink, getApprovedOrganizations, getOrganizerApplications,
  getPlatformOrganizationMembers, getPlatformOrganizationInvites, migrateOrganizationMember, recoverOrganizationManager,
  resendOrganizerActivation, setOrganizationMemberActivity,
  type ApprovedOrganization, type OrganizationMember, type OrganizerApplication, type PendingOrganizerInvite,
} from '../../api/organizations';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';

export function AdminOrganizationsPage() {
  const { t } = useTranslation();
  const [organizations, setOrganizations] = useState<ApprovedOrganization[]>([]);
  const [applications, setApplications] = useState<OrganizerApplication[]>([]);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [invites, setInvites] = useState<PendingOrganizerInvite[]>([]);
  const [selected, setSelected] = useState('');
  const [migration, setMigration] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [replacement, setReplacement] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([getApprovedOrganizations(controller.signal), getOrganizerApplications(controller.signal)])
      .then(([nextOrganizations, nextApplications]) => {
        if (controller.signal.aborted) return;
        setOrganizations(nextOrganizations);
        setApplications(nextApplications);
      }).catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : t('admin:adminOrganizationsPage_khongTheTaiDanhSachToChuc'));
      }).finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision, t]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    void Promise.all([getPlatformOrganizationMembers(selected, controller.signal), getPlatformOrganizationInvites(selected, controller.signal)]).then(([next, pending]) => {
      if (!controller.signal.aborted) { setMembers(next); setInvites(pending); }
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : t('admin:adminOrganizationsPage_khongTheTaiDanhSachToChuc'));
    });
    return () => controller.abort();
  }, [selected, revision, t]);

  async function change(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('admin:adminOrganizationsPage_khongTheLuuThayDoi'));
    } finally {
      setBusy(false);
    }
  }

  return <>
    <AdminPageHeader title={t('shared:partnerOrganizations')} actions={
      <button type="button" className="admin-primary-action" disabled={busy} onClick={() => void change(async () => {
        const { token } = await createPartnerLink();
        setLink(new URL('/partner/apply#token=' + token, window.location.origin).href);
      })}>{t('shared:partnerCreateLink')}</button>
    } />
    {error ? <p role="alert" className="admin-notice error">{error}</p> : null}
    {notice ? <p role="status" className="admin-notice success">{notice}</p> : null}
    {link ? <div className="admin-toolbar">
      <label className="admin-field">{t('shared:partnerPrivateLink')}<input readOnly value={link} onFocus={(e) => e.currentTarget.select()} /></label>
      <button type="button" onClick={() => void change(async () => {
        await navigator.clipboard.writeText(link);
        setNotice(t('shared:partnerLinkCopied'));
      })}>{t('shared:partnerCopyLink')}</button>
    </div> : null}
    <section className="organization-panel" aria-labelledby="partner-applications">
      <h2 id="partner-applications">{t('shared:partnerApplications')}</h2>
      {loading ? <p role="status">{t('admin:adminOrganizationsPage_dangTaiToChuc')}</p> : null}
      {!loading && !applications.length ? <p role="status">{t('shared:partnerNoApplications')}</p> : null}
      {applications.length ? <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>{t('shared:partnerOrganization')}</th><th>{t('shared:partnerManager')}</th>
            <th>{t('shared:partnerFirstEvent')}</th><th>{t('shared:releaseState')}</th><th><span className="sr-only">{t('shared:partnerActions')}</span></th></tr></thead>
          <tbody>{applications.map((item) => <tr key={item.id}>
            <td className="admin-table-primary">{item.organizationName}</td>
            <td>{item.managerName}<span className="admin-table-secondary">{item.email}</span></td>
            <td>{item.firstEvent}</td>
            <td>{t(item.organizationId ? 'shared:partnerApproved' : 'shared:release_SUBMITTED')}</td>
            <td>{item.organizationId ? item.activationPending ? <button type="button" className="admin-secondary-action" disabled={busy} onClick={() => void change(async () => {
              await resendOrganizerActivation(item.id); setNotice(t('shared:partnerInviteQueued'));
            })}>{t('shared:partnerResend')}</button> : null : <button type="button" className="admin-primary-action" disabled={busy}
              onClick={() => void change(async () => {
                await approveOrganizerApplication(item.id);
                setNotice(t('shared:partnerInviteQueued'));
                setRevision((value) => value + 1);
              })}>{t('admin:adminOrganizationsPage_duyetToChuc')}</button>}</td>
          </tr>)}</tbody>
        </table>
      </div> : null}
    </section>
    <section className="organization-panel" aria-labelledby="approved-organizations">
      <h2 id="approved-organizations">{t('admin:adminOrganizationsPage_daDuyet')}</h2>
      <label className="admin-field">{t('shared:partnerOrganization')}
        <WorkspaceSelect label={t('shared:partnerOrganization')} value={selected}
          placeholder={t('admin:adminOrganizationsPage_chonToChuc')}
          options={organizations.map(({ id, name }) => ({ value: id, label: name }))}
          onChange={(id) => { setMembers([]); setInvites([]); setMigration(''); setReplacement(''); setSelected(id); }} />
      </label>
      {selected ? <>
        <Link className="admin-secondary-action"
          to={'/admin/concerts?' + new URLSearchParams({ create: '1', organizationId: selected })}>
          {t('shared:partnerCreateAssisted')}
        </Link>
        <ul className="organization-list">{members.map((member) => <li key={member.accountId}>
          <strong>{member.fullName}</strong> · {member.email}{' '}
          {member.role === 'AUDIENCE' ? <button type="button" className="admin-secondary-action" onClick={() => {
            setWorkEmail(''); setMigration(member.accountId);
          }}>{t('shared:partnerMigrateMember')}</button> : null}
          {member.role === 'ORGANIZER' ? <button type="button" className="admin-secondary-action" disabled={busy}
            onClick={() => void change(async () => {
              await setOrganizationMemberActivity(selected, member.accountId, !member.active);
              setRevision((value) => value + 1);
            })}>{t(member.active ? 'shared:partnerLock' : 'shared:partnerUnlock')}</button> : null}
        </li>)}</ul>
        {migration ? <form className="organization-form" onSubmit={(event) => {
          event.preventDefault();
          void change(async () => {
            const result = await migrateOrganizationMember(selected, migration, workEmail);
            setNotice(t(`shared:partnerInvite_${result.outcome}`));
            if (result.outcome === 'QUEUED' || result.outcome === 'PENDING') setMigration('');
            setRevision((value) => value + 1);
          });
        }}>
          <label className="admin-field">{t('shared:partnerEmail')}<input required type="email" value={workEmail}
            onChange={(event) => setWorkEmail(event.target.value)} /></label>
          <button className="admin-primary-action" disabled={busy}>{t('shared:partnerMigrateMember')}</button>
        </form> : null}
        {invites.length ? <><h3>{t('shared:partnerPendingInvites')}</h3><ul className="organization-list">
          {invites.map((invite) => <li key={invite.id}>{invite.email} · {t(invite.delivered ? 'shared:partnerInviteSent' : 'shared:partnerInvite_QUEUED')}</li>)}
        </ul></> : null}
        {!members.some((member) => member.role === 'ORGANIZER' && member.active && member.grants.includes('MEMBERS')) ? (
          <form className="organization-form" onSubmit={(event) => {
            event.preventDefault();
            void change(async () => {
              await recoverOrganizationManager(selected, replacement.trim());
              setReplacement('');
              setRevision((value) => value + 1);
            });
          }}>
            <label className="admin-field">{t('admin:adminOrganizationsPage_emailQuanLyMoi')}
              <input type="email" required maxLength={254} value={replacement} onChange={(event) => setReplacement(event.target.value)} />
            </label>
            <button className="admin-secondary-action" disabled={busy}>{t('admin:adminOrganizationsPage_khoiPhucQuyenQuanLy')}</button>
          </form>
        ) : null}
      </> : null}
    </section>
  </>;
}
