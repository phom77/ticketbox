import { apiCommand, apiGet } from '../client';
import type { Page } from '../concerts';
import type { UserRole } from '../../features/auth/AuthContext';

export type AdminUser = {
  id: string;
  email: string;
  phone: string | null;
  fullName: string;
  role: UserRole;
  active: boolean;
  isActive?: boolean;
};

// ---- Admin User Management ----

export function getAdminUsers(page = 0, size = 20, signal?: AbortSignal) {
  return apiGet<Page<AdminUser>>(`/api/admin/users?page=${page}&size=${size}`, signal);
}

export function updateAdminUserRole(userId: string, role: UserRole) {
  return apiCommand<AdminUser>('put', `/api/admin/users/${encodeURIComponent(userId)}/role`, {
    role,
  });
}

export function updateAdminUserStatus(userId: string, isActive: boolean) {
  return apiCommand<AdminUser>('put', `/api/admin/users/${encodeURIComponent(userId)}/status`, {
    isActive,
  });
}
