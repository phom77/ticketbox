import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, ShieldCheck, UserCog } from 'lucide-react';
import {
  getAdminUsers,
  updateAdminUserRole,
  updateAdminUserStatus,
  type AdminUser,
} from '../../api/admin';
import { isRequestCanceled } from '../../api/client';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import type { UserRole } from '../../features/auth/AuthContext';

const roles: UserRole[] = ['AUDIENCE', 'ORGANIZER', 'STAFF', 'ADMIN'];

function isUserActive(user: AdminUser) {
  return user.isActive ?? user.active;
}

export function AdminUsersPage() {
  useTranslation();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const activeCount = useMemo(() => users.filter(isUserActive).length, [users]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const page = await getAdminUsers(0, 50, signal);
      setUsers(page.content);
    } catch (requestError) {
      if (!isRequestCanceled(requestError)) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : translate("admin:adminUsersPage_khongTheTaiDanhSachNguoiDung"),
        );
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function changeRole(user: AdminUser, role: UserRole) {
    if (role === user.role || savingId) return;
    setSavingId(user.id);
    setNotice('');
    setError('');
    try {
      const result = await updateAdminUserRole(user.id, role);
      setUsers((current) => current.map((item) => (item.id === user.id ? result.data : item)));
      setNotice(translate("admin:adminUsersPage_daCapNhatVaiTroCho", { arg1: user.fullName }));
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : translate("admin:adminUsersPage_khongTheCapNhatVaiTro"),
      );
    } finally {
      setSavingId(null);
    }
  }

  async function toggleStatus(user: AdminUser) {
    if (savingId) return;
    setSavingId(user.id);
    setNotice('');
    setError('');
    try {
      const result = await updateAdminUserStatus(user.id, !isUserActive(user));
      setUsers((current) => current.map((item) => (item.id === user.id ? result.data : item)));
      setNotice(
        translate("admin:adminUsersPage_hien", { arg1: result.data.fullName, arg2: isUserActive(result.data) ? translate("admin:adminUsersPage_dangHoatDong") : translate("admin:adminUsersPage_daBiKhoa") }),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : translate("admin:adminUsersPage_khongTheCapNhatTrangThai"),
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <AdminPageHeader
        eyebrow={translate("admin:adminUsersPage_chiDanhChoAdmin")}
        title={translate("admin:adminUsersPage_quanLyNguoiDung")}
        description={translate("admin:adminUsersPage_theoDoiTaiKhoanHeThongDoi")}
        actions={
          <button
            className="admin-secondary-action"
            type="button"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw aria-hidden="true" size={16} className={loading ? 'spin' : ''} />
            {translate("admin:adminUsersPage_lamMoi")}
          </button>
        }
      />

      {notice ? (
        <div className="admin-notice success" role="status">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="admin-notice error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="admin-toolbar">
        <div>
          <strong className="admin-table-primary">{users.length} {translate("admin:adminUsersPage_taiKhoan")}</strong>
          <span className="admin-table-secondary">{activeCount} {translate("admin:adminUsersPage_dangHoatDong")}</span>
        </div>
      </div>

      <section className="admin-data-panel">
        {loading ? (
          <div className="admin-row-skeleton" aria-label={translate("admin:adminUsersPage_dangTaiNguoiDung")} aria-live="polite">
            {[1, 2, 3].map((item) => (
              <span key={item} />
            ))}
          </div>
        ) : users.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{translate("admin:adminUsersPage_nguoiDung")}</th>
                  <th>{translate("admin:adminUsersPage_vaiTro")}</th>
                  <th>{translate("admin:adminUsersPage_trangThai")}</th>
                  <th>
                    <span className="sr-only">{translate("admin:adminUsersPage_thaoTac")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const active = isUserActive(user);
                  const saving = savingId === user.id;
                  return (
                    <tr key={user.id}>
                      <td>
                        <strong className="admin-table-primary">{user.fullName}</strong>
                        <span className="admin-table-secondary">{user.email}</span>
                        <span className="admin-table-secondary">
                          {user.phone}
                        </span>
                        <details className="admin-table-secondary">
                          <summary>{translate("admin:adminUsersPage_maTaiKhoan")}</summary>
                          <code>{user.id}</code>
                        </details>
                      </td>
                      <td>
                        <label className="sr-only" htmlFor={`role-${user.id}`}>
                          {translate("admin:adminUsersPage_vaiTro")}
                        </label>
                        <select
                          id={`role-${user.id}`}
                          value={user.role}
                          disabled={savingId !== null}
                          onChange={(event) =>
                            void changeRole(user, event.target.value as UserRole)
                          }
                        >
                          {roles.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <span
                          className={`status-badge ${active ? 'badge-success' : 'badge-muted'}`}
                        >
                          {active ? translate("admin:adminUsersPage_hoatDong") : translate("admin:adminUsersPage_daKhoa")}
                        </span>
                      </td>
                      <td>
                        <button
                          className="admin-secondary-action"
                          type="button"
                          disabled={savingId !== null}
                          onClick={() => void toggleStatus(user)}
                        >
                          {saving ? (
                            <RefreshCw aria-hidden="true" size={15} className="spin" />
                          ) : active ? (
                            <UserCog aria-hidden="true" size={15} />
                          ) : (
                            <ShieldCheck aria-hidden="true" size={15} />
                          )}
                          {active ? translate("admin:adminUsersPage_khoa") : translate("admin:adminUsersPage_moKhoa")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="admin-empty-state">
            <UserCog aria-hidden="true" size={28} />
            <h2>{translate("admin:adminUsersPage_chuaCoNguoiDung")}</h2>
            <p>{translate("admin:adminUsersPage_taiKhoanSeXuatHienSauKhi")}</p>
          </div>
        )}
      </section>
    </>
  );
}
