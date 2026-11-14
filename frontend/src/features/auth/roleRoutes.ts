import { translate } from '../../i18n';
import type { UserRole } from './AuthContext';

export const roleHome: Record<UserRole, string> = {
  AUDIENCE: '/',
  ORGANIZER: '/organizer',
  STAFF: '/staff',
  ADMIN: '/admin',
};

export const roleHomeLabel: Record<UserRole, string> = {
  get AUDIENCE() { return translate("shared:roleRoutes_quayLaiSuKien"); },
  get ORGANIZER() { return translate("shared:roleRoutes_khongGianNhaToChuc"); },
  get STAFF() { return translate("shared:roleRoutes_vanHanhCong"); },
  get ADMIN() { return translate("shared:roleRoutes_quanTriHeThong"); },
};

export function getRoleHome(role?: UserRole | null) {
  return role ? roleHome[role] : '/';
}

export function getRoleHomeLabel(role?: UserRole | null) {
  return role ? roleHomeLabel[role] : translate("shared:roleRoutes_trangChuTicketbox");
}
