import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Bell, CalendarDays, Ticket, UserCog, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthContext';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { OrderSupportQueue } from './OrderSupportQueue';

const workspaces = [
  {
    to: '/admin/concerts',
    get title() { return translate("admin:adminOverviewPage_buoiDien"); },
    get copy() { return translate("admin:adminOverviewPage_taoChuongTrinhCapNhatThongTin"); },
    icon: CalendarDays,
  },
  {
    to: '/admin/ticket-types',
    get title() { return translate("admin:adminOverviewPage_hangVe"); },
    get copy() { return translate("admin:adminOverviewPage_quanLyGiaSoLuongVaMau"); },
    icon: Ticket,
  },
  {
    to: '/admin/guests',
    get title() { return translate("admin:adminOverviewPage_khachMoi"); },
    get copy() { return translate("admin:adminOverviewPage_nhapDanhSachCsvVaTheoDoi"); },
    icon: Users,
  },
  {
    to: '/admin/notifications',
    get title() { return translate("admin:adminOverviewPage_thongBao"); },
    get copy() { return translate("admin:adminOverviewPage_theoDoiThongBaoThuGuiLai"); },
    icon: Bell,
  },
  {
    to: '/admin/users',
    get title() { return translate("admin:adminOverviewPage_nguoiDung"); },
    get copy() { return translate("admin:adminOverviewPage_doiVaiTroKhoaHoacMoTai"); },
    icon: UserCog,
  },
];

export function AdminOverviewPage() {
  useTranslation();
  const { user } = useAuth();

  return (
    <>
      <AdminPageHeader
        eyebrow={translate("admin:adminOverviewPage_trungTamDieuPhoi")}
        title={translate("admin:adminOverviewPage_chao", { arg1: user?.fullName ?? translate("admin:adminOverviewPage_ban") })}
        description={translate("admin:adminOverviewPage_dieuPhoiChuongTrinhHangVeVa")}
        actions={
          <Link className="admin-primary-action" to="/admin/concerts?create=1">
            {translate("admin:adminOverviewPage_taoConcert")}
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
              <div>
                <h2>{workspace.title}</h2>
                <p>{workspace.copy}</p>
              </div>
              <ArrowUpRight aria-hidden="true" size={18} />
            </Link>
          );
        })}
      </section>
    </>
  );
}
