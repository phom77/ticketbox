import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { type FormEvent, useState } from 'react';
import { acceptOrganizationInvite, type OrganizationGrant } from '../../api/organizations';
import { useOrganization } from '../../features/organizations/OrganizationProvider';
import {
  ArrowUpRight,
  CalendarDays,
  CircleDollarSign,
  Ticket,
  Users,
  UserCog,
  Receipt,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { useAuth } from '../../features/auth/AuthContext';

const workspaces: {
  to: string;
  title: string;
  copy: string;
  icon: typeof CalendarDays;
  grant: OrganizationGrant;
}[] = [
  {
    to: '/organizer/concerts',
    grant: 'EVENTS',
    get title() { return translate("organizer:organizerOverviewPage_buoiDien"); },
    get copy() { return translate("organizer:organizerOverviewPage_taoChuongTrinhCapNhatThongTin"); },
    icon: CalendarDays,
  },
  {
    to: '/organizer/ticket-types',
    grant: 'EVENTS',
    get title() { return translate("organizer:organizerOverviewPage_hangVe"); },
    get copy() { return translate("organizer:organizerOverviewPage_quanLyGiaSoLuongVaMau"); },
    icon: Ticket,
  },
  {
    to: '/organizer/guests',
    grant: 'EVENTS',
    get title() { return translate("organizer:organizerOverviewPage_khachMoi"); },
    get copy() { return translate("organizer:organizerOverviewPage_duaDanhSachCsvVaoLichImport"); },
    icon: Users,
  },
  {
    to: '/organizer/revenue',
    grant: 'FINANCE',
    get title() { return translate('organizer:organizerOverviewPage_revenue'); },
    get copy() { return translate("organizer:organizerOverviewPage_theoDoiDoanhThuLuongVeBan"); },
    icon: CircleDollarSign,
  },
  {
    to: '/organizer/orders', grant: 'FINANCE', get title() { return translate("organizer:organizerOverviewPage_donHangVaVe"); },
    get copy() { return translate("organizer:organizerOverviewPage_traCuuGiaoDichVaVeCua"); }, icon: Receipt,
  },
  {
    to: '/organizer/members', grant: 'MEMBERS', get title() { return translate("organizer:organizerOverviewPage_thanhVien"); },
    get copy() { return translate("organizer:organizerOverviewPage_moiThanhVienVaCapNhatQuyen"); }, icon: UserCog,
  },
];

export function OrganizerOverviewPage() {
  useTranslation();
  const { user } = useAuth();
  const organization = useOrganization();
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const selected = organization?.selected;

  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (joining || !organization) return;
    setJoining(true);
    setError('');
    setNotice('');
    try {
      const { id } = await acceptOrganizationInvite(code.trim());
      setCode('');
      await organization.reload(id);
      setNotice(translate("organizer:organizerOverviewPage_daThamGiaToChuc"));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : translate("organizer:organizerOverviewPage_khongTheNhanLoiMoi"));
    } finally {
      setJoining(false);
    }
  }

  return (
    <>
      <AdminPageHeader
        title={selected?.name ?? translate("organizer:organizerOverviewPage_toChucCuaBan")}
        description={translate("organizer:organizerOverviewPage_chonToChucDeMoCacMuc")}
        actions={selected?.grants.includes('EVENTS') ? (
          <Link className="admin-primary-action" to="/organizer/concerts?create=1">
            {translate("organizer:organizerOverviewPage_taoConcert")}
            <ArrowUpRight aria-hidden="true" size={17} />
          </Link>
        ) : null}
      />

      {organization?.loading ? <p role="status">{translate("organizer:organizerOverviewPage_dangTaiToChuc")}</p> : null}
      {organization?.error ? (
        <div className="admin-notice error" role="alert">
          <p>{organization.error}</p>
          <button className="admin-secondary-action" type="button" onClick={() => void organization.reload()}>{translate("organizer:organizerOverviewPage_thuLai")}</button>
        </div>
      ) : null}
      {selected ? (
        <section className="admin-workspace-grid" aria-label={translate("organizer:organizerOverviewPage_khuVucQuanLyCuaNhaTo")}>
        {workspaces.filter((workspace) => selected.grants.includes(workspace.grant)).map((workspace) => {
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
      ) : null}
      <section className="admin-data-panel organization-panel">
        <h2>{translate("organizer:organizerOverviewPage_nhanLoiMoi")}</h2>
        <p>{translate("organizer:organizerOverviewPage_chiaSeMaTaiKhoanNayVoi")}</p>
        <code>{user?.id}</code>
        {notice ? <p className="admin-notice success" role="status">{notice}</p> : null}
        {error ? <p className="admin-notice error" role="alert">{error}</p> : null}
        <form className="organization-form" onSubmit={(event) => void accept(event)}>
          <label className="admin-field">
            {translate("organizer:organizerOverviewPage_maLoiMoi")}
            <input value={code} onChange={(event) => setCode(event.target.value)} required minLength={36} maxLength={36} />
          </label>
          <button className="admin-primary-action" type="submit" disabled={joining}>{translate("organizer:organizerOverviewPage_thamGiaToChuc")}</button>
        </form>
      </section>
    </>
  );
}
