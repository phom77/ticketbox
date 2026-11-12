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
  return (
    <fieldset className="organization-grants" disabled={disabled}>
      <legend>Quyền</legend>
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
  const changed = value.length !== member.grants.length || value.some((grant) => !member.grants.includes(grant));
  return (
    <li>
      <form className="organization-form" onSubmit={(event) => { event.preventDefault(); void save(value); }}>
        <div><code>{member.accountId}</code>{!member.active ? <p>Tài khoản đã khóa</p> : null}</div>
        <GrantFields value={value} onChange={setValue} disabled={disabled} />
        <button className="admin-secondary-action" type="submit" disabled={disabled || !changed}>
          {value.length ? 'Lưu quyền' : 'Gỡ thành viên'}
        </button>
      </form>
    </li>
  );
}

export function OrganizationMembersPage() {
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
        setError(failure instanceof Error ? failure.message : 'Không thể tải danh sách thành viên.');
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
      setError(failure instanceof Error ? failure.message : 'Không thể tạo lời mời.');
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
      setNotice(value.length ? 'Đã cập nhật quyền.' : 'Đã gỡ thành viên.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Không thể cập nhật quyền.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <AdminPageHeader title="Thành viên" description={organization?.selected?.name ?? ''} />
      {notice ? <p className="admin-notice success" role="status">{notice}</p> : null}
      {error ? <p className="admin-notice error" role="alert">{error}</p> : null}
      <section className="admin-data-panel organization-panel">
        <h2>Mời thành viên</h2>
        <form className="organization-form" onSubmit={(event) => void sendInvite(event)}>
          <label className="admin-field">
            Mã tài khoản người nhận
            <input value={account} onChange={(event) => setAccount(event.target.value)} required minLength={36} maxLength={36} />
          </label>
          <GrantFields value={selectedGrants} onChange={setSelectedGrants} disabled={saving} />
          <button className="admin-primary-action" type="submit" disabled={saving || selectedGrants.length === 0}>Tạo lời mời</button>
        </form>
        {invite ? (
          <div className="admin-notice success" role="status">
            <p>Gửi mã này cho người được mời. Hết hạn lúc {new Date(invite.expiresAt).toLocaleString('vi-VN')}.</p>
            <code>{invite.code}</code>
          </div>
        ) : null}
      </section>
      <section className="admin-data-panel organization-panel" aria-labelledby="organization-member-list">
        <h2 id="organization-member-list">Danh sách thành viên</h2>
        {loading ? <p role="status">Đang tải thành viên…</p> : null}
        <ul className="organization-list">
          {members.map((member) => (
            <MemberEditor key={`${member.accountId}:${member.grants.join(',')}`} member={member}
              save={(value) => save(member.accountId, value)} disabled={saving} />
          ))}
        </ul>
        <button className="admin-secondary-action" type="button" onClick={() => void load()} disabled={saving || loading}>
          Làm mới danh sách
        </button>
      </section>
    </>
  );
}
