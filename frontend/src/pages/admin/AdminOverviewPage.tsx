import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Bell, CalendarDays, UserCog } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthContext';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { OrderSupportQueue } from './OrderSupportQueue';

const workspaces = [
  {
    to: '/admin/concerts',
    get title() { return translate("admin:adminOverviewPage_buoiDien"); },

    icon: CalendarDays,
  },
  {
    to: '/admin/notifications',
    get title() { return translate("admin:adminOverviewPage_thongBao"); },

    icon: Bell,
  },
  {
    to: '/admin/users',
    get title() { return translate("shared:partnerInternalAccounts"); },

    icon: UserCog,
  },
];

export function AdminOverviewPage() {
  useTranslation();
  const { user } = useAuth();

  return (
    <>
      <AdminPageHeader
        title={translate("admin:adminOverviewPage_chao", { arg1: user?.fullName ?? translate("admin:adminOverviewPage_ban") })}
        actions={
          <Link className="admin-primary-action" to="/admin/concerts?create=1">
            {translate("shared:partnerCreateAssisted")}
            <ArrowUpRight aria-hidden="true" size={17} />
          </Link>
        }
      />

      <OrderSupportQueue />

      <section className="admin-workspace-grid" aria-label={translate("admin:adminOverviewPage_khuVucQuanLy")}>
        {workspaces.map((workspace) => {
          const Icon = workspace.icon;
          return (
            <Link key={workspace.to} to={workspace.to} className="admin-workspace-link">
              <Icon aria-hidden="true" size={22} strokeWidth={1.7} />
              <h2>{workspace.title}</h2>
              <ArrowUpRight aria-hidden="true" size={18} />
            </Link>
          );
        })}
      </section>
    </>
  );
}
