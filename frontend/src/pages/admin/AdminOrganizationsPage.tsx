import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { type FormEvent, useEffect, useState } from 'react';
import {
  approveOrganization,
  getApprovedOrganizations,
  recoverOrganizationManager,
  type ApprovedOrganization,
} from '../../api/organizations';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';

export function AdminOrganizationsPage() {
  useTranslation();
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
        setError(failure instanceof Error ? failure.message : translate("admin:adminOrganizationsPage_khongTheTaiDanhSachToChuc"));
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
        setNotice(translate("admin:adminOrganizationsPage_daDuyetToChuc"));
        await load();
      } else {
        await recoverOrganizationManager(recoveryOrganization, recoveryAccount.trim());
        setRecoveryAccount('');
        setNotice(translate("admin:adminOrganizationsPage_daCapQuyenChoQuanLyMoi"));
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : translate("admin:adminOrganizationsPage_khongTheLuuThayDoi"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <AdminPageHeader title={translate("admin:adminOrganizationsPage_toChuc")} description={translate("admin:adminOrganizationsPage_duyetDoiTacVaChiDinhTai")} />
      {notice ? <p className="admin-notice success" role="status">{notice}</p> : null}
      {error ? <p className="admin-notice error" role="alert">{error}</p> : null}

      <section className="admin-data-panel organization-panel">
        <h2>{translate("admin:adminOrganizationsPage_duyetToChuc")}</h2>
        <form className="organization-form" onSubmit={(event) => void submit(event, 'approve')}>
          <label className="admin-field">
            {translate("admin:adminOrganizationsPage_tenToChuc")}
            <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={160} />
          </label>
          <label className="admin-field">
            {translate("admin:adminOrganizationsPage_maTaiKhoanQuanLy")}
            <input value={account} onChange={(event) => setAccount(event.target.value)} required minLength={36} maxLength={36} />
          </label>
          <button className="admin-primary-action" type="submit" disabled={saving}>{translate("admin:adminOrganizationsPage_duyetToChuc")}</button>
        </form>
      </section>

      <section className="admin-data-panel organization-panel" aria-labelledby="approved-organizations">
        <h2 id="approved-organizations">{translate("admin:adminOrganizationsPage_daDuyet")}</h2>
        {loading ? <p role="status">{translate("admin:adminOrganizationsPage_dangTaiToChuc")}</p> : null}
        {!loading && organizations.length === 0 ? <p>{translate("admin:adminOrganizationsPage_chuaCoToChucDaDuyet")}</p> : null}
        {organizations.length > 0 ? (
          <ul className="organization-list">
            {organizations.map((organization) => <li key={organization.id}>{organization.name}</li>)}
          </ul>
        ) : null}
        <button className="admin-secondary-action" type="button" disabled={loading} onClick={() => void load()}>
          {translate("admin:adminOrganizationsPage_lamMoiDanhSach")}
        </button>
      </section>

      {organizations.length > 0 ? (
        <section className="admin-data-panel organization-panel">
          <h2>{translate("admin:adminOrganizationsPage_khoiPhucQuyenQuanLy")}</h2>
          <p>{translate("admin:adminOrganizationsPage_dungKhiToChucKhongConQuan")}</p>
          <form className="organization-form" onSubmit={(event) => void submit(event, 'recover')}>
            <label className="admin-field">
              {translate("admin:adminOrganizationsPage_toChuc")}
              <select value={recoveryOrganization} onChange={(event) => setRecoveryOrganization(event.target.value)} required>
                <option value="">{translate("admin:adminOrganizationsPage_chonToChuc")}</option>
                {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
              </select>
            </label>
            <label className="admin-field">
              {translate("admin:adminOrganizationsPage_maTaiKhoanQuanLyMoi")}
              <input value={recoveryAccount} onChange={(event) => setRecoveryAccount(event.target.value)} required minLength={36} maxLength={36} />
            </label>
            <button className="admin-primary-action" type="submit" disabled={saving}>{translate("admin:adminOrganizationsPage_capQuyenQuanLy")}</button>
          </form>
        </section>
      ) : null}
    </>
  );
}
