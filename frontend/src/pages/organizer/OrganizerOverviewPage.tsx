import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { type OrganizationGrant } from '../../api/organizations';
import { useOrganization } from '../../features/organizations/OrganizationProvider';
import {
  ArrowUpRight,
  CalendarDays,
  CircleDollarSign,
  UserCog,
  Receipt,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';

const workspaces: {
  to: string;
  title: string;
  icon: typeof CalendarDays;
  grant: OrganizationGrant;
}[] = [
  {
    to: '/organizer/concerts',
    grant: 'EVENTS',
    get title() { return translate("organizer:organizerOverviewPage_buoiDien"); },

    icon: CalendarDays,
  },
  {
    to: '/organizer/revenue',
    grant: 'FINANCE',
    get title() { return translate('organizer:organizerOverviewPage_revenue'); },

    icon: CircleDollarSign,
  },
  {
    to: '/organizer/orders', grant: 'FINANCE', get title() { return translate("organizer:organizerOverviewPage_donHangVaVe"); },
    icon: Receipt,
  },
  {
    to: '/organizer/members', grant: 'MEMBERS', get title() { return translate("organizer:organizerOverviewPage_thanhVien"); },
    icon: UserCog,
  },
];

export function OrganizerOverviewPage() {
  useTranslation();
  const organization = useOrganization();
  const selected = organization?.selected;

  return (
    <>
      <AdminPageHeader
        title={selected?.name ?? translate("organizer:organizerOverviewPage_toChucCuaBan")}
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
              <h2>{workspace.title}</h2>
              <ArrowUpRight aria-hidden="true" size={18} />
            </Link>
          );
        })}
        </section>
      ) : null}
    </>
  );
}
