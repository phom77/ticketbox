import { type FormEvent, useEffect, useState } from 'react';
import {
  approveOrganization,
  getApprovedOrganizations,
  recoverOrganizationManager,
  type ApprovedOrganization,
} from '../../api/organizations';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';

export function AdminOrganizationsPage() {
  const [organizations, setOrganizations] = useState<ApprovedOrganization[]>([]);
  const [name, setName] = useState('');
  const [account, setAccount] = useState('');
  const [recoveryOrganization, setRecoveryOrganization] = useState('');
  const [recoveryAccount, setRecoveryAccount] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load(signal?: AbortSignal) {
    setLoading(true);
    setError('');
    try {
      const next = await getApprovedOrganizations(signal);
      if (!signal?.aborted) setOrganizations(next);
    } catch (failure) {
      if (!signal?.aborted) {
        setError(failure instanceof Error ? failure.message : 'Không thể tải danh sách tổ chức.');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>, action: 'approve' | 'recover') {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (action === 'approve') {
        await approveOrganization(name.trim(), account.trim());
        setName('');
        setAccount('');
        setNotice('Đã duyệt tổ chức.');
        await load();
      } else {
        await recoverOrganizationManager(recoveryOrganization, recoveryAccount.trim());
        setRecoveryAccount('');
        setNotice('Đã cấp quyền cho quản lý mới.');
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Không thể lưu thay đổi.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <AdminPageHeader title="Tổ chức" description="Duyệt đối tác và chỉ định tài khoản quản lý." />
      {notice ? <p className="admin-notice success" role="status">{notice}</p> : null}
      {error ? <p className="admin-notice error" role="alert">{error}</p> : null}

      <section className="admin-data-panel organization-panel">
        <h2>Duyệt tổ chức</h2>
        <form className="organization-form" onSubmit={(event) => void submit(event, 'approve')}>
          <label className="admin-field">
            Tên tổ chức
            <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={160} />
          </label>
          <label className="admin-field">
            Mã tài khoản quản lý
            <input value={account} onChange={(event) => setAccount(event.target.value)} required minLength={36} maxLength={36} />
          </label>
          <button className="admin-primary-action" type="submit" disabled={saving}>Duyệt tổ chức</button>
        </form>
      </section>

      <section className="admin-data-panel organization-panel" aria-labelledby="approved-organizations">
        <h2 id="approved-organizations">Đã duyệt</h2>
        {loading ? <p role="status">Đang tải tổ chức…</p> : null}
        {!loading && organizations.length === 0 ? <p>Chưa có tổ chức đã duyệt.</p> : null}
        {organizations.length > 0 ? (
          <ul className="organization-list">
            {organizations.map((organization) => <li key={organization.id}>{organization.name}</li>)}
          </ul>
        ) : null}
        <button className="admin-secondary-action" type="button" disabled={loading} onClick={() => void load()}>
          Làm mới danh sách
        </button>
      </section>

      {organizations.length > 0 ? (
        <section className="admin-data-panel organization-panel">
          <h2>Khôi phục quyền quản lý</h2>
          <p>Dùng khi tổ chức không còn quản lý đang hoạt động.</p>
          <form className="organization-form" onSubmit={(event) => void submit(event, 'recover')}>
            <label className="admin-field">
              Tổ chức
              <select value={recoveryOrganization} onChange={(event) => setRecoveryOrganization(event.target.value)} required>
                <option value="">Chọn tổ chức</option>
                {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
              </select>
            </label>
            <label className="admin-field">
              Mã tài khoản quản lý mới
              <input value={recoveryAccount} onChange={(event) => setRecoveryAccount(event.target.value)} required minLength={36} maxLength={36} />
            </label>
            <button className="admin-primary-action" type="submit" disabled={saving}>Cấp quyền quản lý</button>
          </form>
        </section>
      ) : null}
    </>
  );
}
