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
            : 'Không thể tải danh sách người dùng.',
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
      setNotice(`Đã cập nhật vai trò cho ${user.fullName}.`);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Không thể cập nhật vai trò.',
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
        `${result.data.fullName} hiện ${isUserActive(result.data) ? 'đang hoạt động' : 'đã bị khóa'}.`,
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Không thể cập nhật trạng thái.',
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <AdminPageHeader
        eyebrow="Chỉ dành cho admin"
        title="Quản lý người dùng"
        description="Theo dõi tài khoản hệ thống, đổi vai trò và khóa/mở tài khoản demo khi cần kiểm thử RBAC."
        actions={
          <button
            className="admin-secondary-action"
            type="button"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw aria-hidden="true" size={16} className={loading ? 'spin' : ''} />
            Làm mới
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
          <strong className="admin-table-primary">{users.length} tài khoản</strong>
          <span className="admin-table-secondary">{activeCount} đang hoạt động</span>
        </div>
      </div>

      <section className="admin-data-panel">
        {loading ? (
          <div className="admin-row-skeleton" aria-label="Đang tải người dùng" aria-live="polite">
            {[1, 2, 3].map((item) => (
              <span key={item} />
            ))}
          </div>
        ) : users.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Người dùng</th>
                  <th>Vai trò</th>
                  <th>Trạng thái</th>
                  <th>
                    <span className="sr-only">Thao tác</span>
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
                          {user.phone ?? user.id.slice(0, 8)}
                        </span>
                      </td>
                      <td>
                        <label className="sr-only" htmlFor={`role-${user.id}`}>
                          Vai trò
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
                          {active ? 'Hoạt động' : 'Đã khóa'}
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
                          {active ? 'Khóa' : 'Mở khóa'}
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
            <h2>Chưa có người dùng</h2>
            <p>Tài khoản sẽ xuất hiện sau khi seed hoặc đăng ký thành công.</p>
          </div>
        )}
      </section>
    </>
  );
}
