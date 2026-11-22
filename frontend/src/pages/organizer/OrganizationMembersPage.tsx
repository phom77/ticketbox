import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
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
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { useAuth } from '../../features/auth/AuthContext';
import { useOrganization } from '../../features/organizations/OrganizationProvider';

const grants = Object.keys(organizationGrantLabels) as OrganizationGrant[];

function GrantFields({
  value, onChange, disabled,
}: { value: OrganizationGrant[]; onChange: (value: OrganizationGrant[]) => void; disabled: boolean }) {
  useTranslation();
  return (
    <fieldset className="organization-grants" disabled={disabled}>
      <legend>{translate("organizer:organizationMembersPage_quyen")}</legend>
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
  useTranslation();
  const [value, setValue] = useState(member.grants);
  const changed = value.length !== member.grants.length || value.some((grant) => !member.grants.includes(grant));
  return (
    <li>
      <form className="organization-form" onSubmit={(event) => { event.preventDefault(); void save(value); }}>
        <div><strong>{member.fullName}</strong><p>{member.email}</p>{!member.active ? <p>{translate("organizer:organizationMembersPage_taiKhoanDaKhoa")}</p> : null}</div>
        <GrantFields value={value} onChange={setValue} disabled={disabled} />
        <button className="admin-secondary-action" type="submit" disabled={disabled || !changed}>
          {value.length ? translate("organizer:organizationMembersPage_luuQuyen") : translate("organizer:organizationMembersPage_goThanhVien")}
        </button>
      </form>
    </li>
  );
}

export function OrganizationMembersPage() {
  useTranslation();
  const organization = useOrganization();
  const { user } = useAuth();
  const id = organization?.selected?.id;
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [emails, setEmails] = useState('');
  const [selectedGrants, setSelectedGrants] = useState<OrganizationGrant[]>([]);
  const [results, setResults] = useState<InviteResult[]>([]);
  const [pending, setPending] = useState<PendingOrganizerInvite[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const [next, invites] = await Promise.all([getOrganizationMembers(id, signal), getPendingOrganizationInvites(id, signal)]);
      if (!signal?.aborted) { setMembers(next); setPending(invites); }
    } catch (failure) {
      if (!signal?.aborted) {
        setError(failure instanceof Error ? failure.message : translate("organizer:organizationMembersPage_khongTheTaiDanhSachThanhVien"));
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
      setNotice(value.length ? translate("organizer:organizationMembersPage_daCapNhatQuyen") : translate("organizer:organizationMembersPage_daGoThanhVien"));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : translate("organizer:organizationMembersPage_khongTheCapNhatQuyen"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <AdminPageHeader title={translate("organizer:organizationMembersPage_thanhVien")} description={organization?.selected?.name ?? ''} />
      {notice ? <p className="admin-notice success" role="status">{notice}</p> : null}
      {error ? <p className="admin-notice error" role="alert">{error}</p> : null}
      <section className="admin-data-panel organization-panel">
        <h2>{translate("organizer:organizationMembersPage_moiThanhVien")}</h2>
        <form className="organization-form" onSubmit={(event) => void sendInvite(event)}>
          <label className="admin-field">
            {translate("shared:partnerTeamEmails")}
            <textarea required rows={3} maxLength={12800} value={emails} onChange={(event) => setEmails(event.target.value)} />
          </label>
          <GrantFields value={selectedGrants} onChange={setSelectedGrants} disabled={saving} />
          <button className="admin-primary-action" type="submit" disabled={saving || selectedGrants.length === 0}>{translate("organizer:organizationMembersPage_taoLoiMoi")}</button>
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
      </section>
      <section className="admin-data-panel organization-panel" aria-labelledby="organization-member-list">
        <h2 id="organization-member-list">{translate("organizer:organizationMembersPage_danhSachThanhVien")}</h2>
        {loading ? <p role="status">{translate("organizer:organizationMembersPage_dangTaiThanhVien")}</p> : null}
        <ul className="organization-list">
          {members.map((member) => (
            <MemberEditor key={`${member.accountId}:${member.grants.join(',')}`} member={member}
              save={(value) => save(member.accountId, value)} disabled={saving} />
          ))}
        </ul>
        <button className="admin-secondary-action" type="button" onClick={() => void load()} disabled={saving || loading}>
          {translate("organizer:organizationMembersPage_lamMoiDanhSach")}
        </button>
      </section>
    </>
  );
}
