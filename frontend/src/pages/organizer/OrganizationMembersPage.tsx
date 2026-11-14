import { translate, formatLanguage } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import {
  createOrganizationInvite,
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
        <div><code>{member.accountId}</code>{!member.active ? <p>{translate("organizer:organizationMembersPage_taiKhoanDaKhoa")}</p> : null}</div>
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
  const [account, setAccount] = useState('');
  const [selectedGrants, setSelectedGrants] = useState<OrganizationGrant[]>([]);
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const next = await getOrganizationMembers(id, signal);
      if (!signal?.aborted) setMembers(next);
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
    setInvite(null);
    try {
      setInvite(await createOrganizationInvite(id, account.trim(), selectedGrants));
      setAccount('');
      setSelectedGrants([]);
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
            {translate("organizer:organizationMembersPage_maTaiKhoanNguoiNhan")}
            <input value={account} onChange={(event) => setAccount(event.target.value)} required minLength={36} maxLength={36} />
          </label>
          <GrantFields value={selectedGrants} onChange={setSelectedGrants} disabled={saving} />
          <button className="admin-primary-action" type="submit" disabled={saving || selectedGrants.length === 0}>{translate("organizer:organizationMembersPage_taoLoiMoi")}</button>
        </form>
        {invite ? (
          <div className="admin-notice success" role="status">
            <p>{translate("organizer:organizationMembersPage_guiMaNayChoNguoiDuocMoi")} {new Date(invite.expiresAt).toLocaleString(formatLanguage())}.</p>
            <code>{invite.code}</code>
          </div>
        ) : null}
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
