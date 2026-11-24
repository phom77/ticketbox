import { translate, formatLanguage } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Search, UserPlus, X } from 'lucide-react';
import {
  createOrganizationInvites,
  getPendingOrganizationInvites,
  resendOrganizationInvite,
  type InviteResult,
  type PendingOrganizerInvite,
  getOrganizationMembers,
  organizationGrantLabels,
  type OrganizationGrant,
  type OrganizationMember,
  updateOrganizationMember,
} from '../../api/organizations';
import { useAuth } from '../../features/auth/AuthContext';
import { useOrganization } from '../../features/organizations/OrganizationProvider';
import './WorkspaceRecords.css';

const grants = Object.keys(organizationGrantLabels) as OrganizationGrant[];
type MemberPanel = { kind: 'invite' } | { kind: 'edit'; accountId: string };

function GrantFields({
  value, onChange, disabled,
}: { value: OrganizationGrant[]; onChange: (value: OrganizationGrant[]) => void; disabled: boolean }) {
  return (
    <fieldset className="member-grant-fields" disabled={disabled}>
      <legend>{translate('organizer:organizationMembersPage_quyen')}</legend>
      {grants.map((grant) => (
        <label key={grant}>
          <input type="checkbox" checked={value.includes(grant)} onChange={(event) => {
            onChange(event.target.checked ? [...value, grant] : value.filter((item) => item !== grant));
          }} />
          {organizationGrantLabels[grant]}
        </label>
      ))}
    </fieldset>
  );
}

function MemberEditor({
  member, save, disabled,
}: { member: OrganizationMember; save: (value: OrganizationGrant[]) => Promise<void>; disabled: boolean }) {
  const [value, setValue] = useState(member.grants);
  const [removing, setRemoving] = useState(false);
  const confirmation = useRef<HTMLParagraphElement>(null);
  const changed = value.length !== member.grants.length || value.some((grant) => !member.grants.includes(grant));

  useEffect(() => {
    if (removing) confirmation.current?.focus();
  }, [removing]);

  return (
    <form className="workspace-records-form" onSubmit={(event) => {
      event.preventDefault();
      if (!changed || disabled) return;
      if (!value.length && !removing) {
        setRemoving(true);
        return;
      }
      void save(value);
    }}>
      <div className="workspace-records-account">
        <span>{member.fullName}</span>
        <small>{member.email}</small>
      </div>
      {removing ? (
        <p ref={confirmation} tabIndex={-1} className="workspace-records-callout">
          {translate('organizer:organizationMembersPage_confirmRemoval')}
        </p>
      ) : <GrantFields value={value} onChange={setValue} disabled={disabled} />}
      <div className="workspace-records-actions">
        {removing && <button className="admin-secondary-action" type="button" disabled={disabled} onClick={() => setRemoving(false)}>
          {translate('shared:adminConfirmDialog_huy')}
        </button>}
        <button className={removing ? 'admin-danger-action' : 'admin-primary-action'} type="submit" disabled={disabled || !changed}>
          {value.length ? translate('organizer:organizationMembersPage_luuQuyen') : translate('organizer:organizationMembersPage_goThanhVien')}
        </button>
      </div>
    </form>
  );
}

export function OrganizationMembersPage() {
  useTranslation();
  const organization = useOrganization();
  const { user } = useAuth();
  const id = organization?.selected?.id;
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [query, setQuery] = useState('');
  const [panel, setPanel] = useState<MemberPanel | null>(null);
  const [emails, setEmails] = useState('');
  const [selectedGrants, setSelectedGrants] = useState<OrganizationGrant[]>([]);
  const [results, setResults] = useState<InviteResult[]>([]);
  const [pending, setPending] = useState<PendingOrganizerInvite[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  const inviteButton = useRef<HTMLButtonElement>(null);
  const panelHeading = useRef<HTMLHeadingElement>(null);
  const selectedMember = panel?.kind === 'edit' ? members.find((member) => member.accountId === panel.accountId) : undefined;
  const panelTitle = panel?.kind === 'invite'
    ? translate('organizer:organizationMembersPage_moiThanhVien')
    : translate('organizer:organizationMembersPage_editPermissions');
  const filter = query.trim().toLocaleLowerCase(formatLanguage());
  const memberRows = members.filter((member) =>
    [member.fullName, member.email].some((value) => value.toLocaleLowerCase(formatLanguage()).includes(filter)));
  const showingPanel = panel?.kind === 'invite' || Boolean(selectedMember);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const [next, invitations] = await Promise.all([getOrganizationMembers(id, signal), getPendingOrganizationInvites(id, signal)]);
      if (!signal?.aborted) { setMembers(next); setPending(invitations); }
    } catch (failure) {
      if (!signal?.aborted) {
        setError(failure instanceof Error ? failure.message : translate('organizer:organizationMembersPage_khongTheTaiDanhSachThanhVien'));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (panel) panelHeading.current?.focus();
  }, [panel]);

  function openPanel(next: MemberPanel, trigger: HTMLButtonElement) {
    opener.current = trigger;
    setPanel(next);
    setError('');
    setNotice('');
  }

  function closePanel() {
    setPanel(null);
    const target = opener.current?.isConnected ? opener.current : inviteButton.current;
    target?.focus();
  }

  async function sendInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id || saving || selectedGrants.length === 0) return;
    setSaving(true);
    setError('');
    setNotice('');
    setResults([]);
    try {
      const recipients = emails.split(/[\n,;]+/).map((email) => email.trim()).filter(Boolean);
      if (recipients.length > 50) throw new Error(translate("shared:partnerBatchLimit"));
      setResults(await createOrganizationInvites(id, recipients, selectedGrants));
      setEmails('');
      setSelectedGrants([]);
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : translate("organizer:organizationMembersPage_khongTheTaoLoiMoi"));
    } finally {
      setSaving(false);
    }
  }

  async function save(accountId: string, value: OrganizationGrant[]) {
    if (!id || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await updateOrganizationMember(id, accountId, value);
      if (accountId === user?.id) await organization?.reload(id);
      else await load();
      if (!value.length) closePanel();
      setNotice(value.length ? translate('organizer:organizationMembersPage_daCapNhatQuyen') : translate('organizer:organizationMembersPage_daGoThanhVien'));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : translate('organizer:organizationMembersPage_khongTheCapNhatQuyen'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="workspace-records">
      <header className="workspace-records-header">
        <div>
          <h1>{translate('organizer:organizationMembersPage_thanhVien')}</h1>
        </div>
        <button ref={inviteButton} className="admin-primary-action" type="button" disabled={saving} onClick={(event) => {
          openPanel({ kind: 'invite' }, event.currentTarget);
        }} aria-expanded={panel?.kind === 'invite'} aria-controls={showingPanel ? 'member-work-panel' : undefined}>
          <UserPlus size={18} aria-hidden /> {translate('organizer:organizationMembersPage_moiThanhVien')}
        </button>
      </header>
      {notice && <p className="admin-notice success" role="status">{notice}</p>}
      {error && <p className="admin-notice error" role="alert">{error}</p>}
      <div className="workspace-members" data-inspecting={showingPanel}>
        <section className="workspace-records-panel" aria-labelledby="organization-member-list">
          <div className="workspace-records-toolbar">
            <div>
              <h2 id="organization-member-list">{translate('organizer:organizationMembersPage_danhSachThanhVien')}</h2>
              {!loading && !error && <p>{translate('organizer:organizationMembersPage_memberCount', { count: memberRows.length })}</p>}
            </div>
            <div className="workspace-records-actions">
              <label className="workspace-records-search">
                <Search size={18} aria-hidden />
                <span className="sr-only">{translate('organizer:organizationMembersPage_searchMembers')}</span>
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
                  placeholder={translate('organizer:organizationMembersPage_searchMembers')} />
              </label>
              <button className="admin-secondary-action workspace-records-icon-button" type="button"
                onClick={() => void load()} disabled={saving || loading}
                aria-label={translate('organizer:organizationMembersPage_lamMoiDanhSach')}
                title={translate('organizer:organizationMembersPage_lamMoiDanhSach')}>
                <RefreshCw size={17} aria-hidden />
              </button>
            </div>
          </div>
          {loading && <p className="workspace-records-empty" role="status">{translate('organizer:organizationMembersPage_dangTaiThanhVien')}</p>}
          {!loading && !error && !memberRows.length && <p className="workspace-records-empty">
            {translate(filter ? 'organizer:organizationMembersPage_noMatchingMembers' : 'organizer:organizationMembersPage_noMembers')}
          </p>}
          {memberRows.length > 0 && <ul className="workspace-member-list">
            {memberRows.map((member) => {
              const display = member.fullName;
              return <li key={member.accountId} data-selected={selectedMember?.accountId === member.accountId}>
                <div className="workspace-member-name">
                  <strong>{display}</strong>
                  <span>{member.email}</span>
                  <small className="workspace-member-status">
                    {translate(member.active ? 'organizer:organizationMembersPage_active' : 'organizer:organizationMembersPage_taiKhoanDaKhoa')}
                  </small>
                </div>
                <ul className="workspace-member-grants" aria-label={translate('organizer:organizationMembersPage_quyen')}>
                  {member.grants.map((grant) => <li key={grant}>{organizationGrantLabels[grant]}</li>)}
                </ul>
                <button type="button" className="admin-secondary-action" disabled={saving}
                  aria-label={translate('organizer:organizationMembersPage_editFor', { member: display })}
                  aria-expanded={selectedMember?.accountId === member.accountId}
                  aria-controls={selectedMember?.accountId === member.accountId ? 'member-work-panel' : undefined}
                  onClick={(event) => openPanel({ kind: 'edit', accountId: member.accountId }, event.currentTarget)}>
                  {translate('organizer:organizationMembersPage_editPermissions')}
                </button>
              </li>;
            })}
          </ul>}
        </section>

        {showingPanel && <section id="member-work-panel" className="workspace-records-panel workspace-member-panel" aria-labelledby="member-work-heading">
          <div className="workspace-records-toolbar">
            <h2 id="member-work-heading" ref={panelHeading} tabIndex={-1}>{panelTitle}</h2>
            <button type="button" className="admin-secondary-action workspace-records-icon-button" onClick={closePanel} disabled={saving}
              aria-label={translate('shared:adminConfirmDialog_dong')}><X size={18} aria-hidden /></button>
          </div>
          {panel?.kind === 'invite' ? <>
            <form className="workspace-records-form" onSubmit={(event) => void sendInvite(event)}>
              <label className="workspace-records-field">
                {translate('shared:partnerTeamEmails')}
                <textarea value={emails} onChange={(event) => setEmails(event.target.value)}
                  required rows={4} maxLength={13000} spellCheck={false} disabled={saving} />
              </label>
              <GrantFields value={selectedGrants} onChange={setSelectedGrants} disabled={saving} />
              <div className="workspace-records-actions">
                <button className="admin-primary-action" type="submit" disabled={saving || !emails.trim() || selectedGrants.length === 0}>
                  {translate('organizer:organizationMembersPage_taoLoiMoi')}
                </button>
              </div>
            </form>
            {results.length ? <ul className="organization-list" aria-live="polite">
              {results.map((result) => <li key={result.email}>{result.email} · {translate(`shared:partnerInvite_${result.outcome}`)}</li>)}
            </ul> : null}
            {pending.length ? <>
              <h3>{translate("shared:partnerPendingInvites")}</h3>
              <ul className="organization-list">{pending.map((invite) => <li key={invite.id}>
                {invite.email} · {translate(invite.delivered ? "shared:partnerInviteSent" : "shared:partnerInvite_QUEUED")}
                <button className="admin-secondary-action" type="button" disabled={saving} onClick={() => {
                  if (!id) return;
                  setSaving(true); setError('');
                  void resendOrganizationInvite(id, invite.email).then(() => load())
                    .catch((failure: unknown) => setError(failure instanceof Error ? failure.message : translate("shared:partnerUnavailable")))
                    .finally(() => setSaving(false));
                }}>{translate("shared:partnerResend")}</button>
              </li>)}</ul>
            </> : null}
          </> : selectedMember && <MemberEditor key={`${selectedMember.accountId}:${selectedMember.grants.join(',')}`}
            member={selectedMember} save={(value) => save(selectedMember.accountId, value)} disabled={saving} />}
        </section>}
      </div>
    </div>
  );
}
