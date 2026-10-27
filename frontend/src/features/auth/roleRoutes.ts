import type { UserRole } from './AuthContext';

export const roleHome: Record<UserRole, string> = {
  AUDIENCE: '/',
  ORGANIZER: '/organizer',
  STAFF: '/staff',
  ADMIN: '/admin',
};

export const roleHomeLabel: Record<UserRole, string> = {
  AUDIENCE: 'Quay lại sự kiện',
  ORGANIZER: 'Không gian nhà tổ chức',
  STAFF: 'Vận hành cổng',
  ADMIN: 'Quản trị hệ thống',
};

export function getRoleHome(role?: UserRole | null) {
  return role ? roleHome[role] : '/';
}

export function getRoleHomeLabel(role?: UserRole | null) {
  return role ? roleHomeLabel[role] : 'Trang chủ TicketBox';
}
