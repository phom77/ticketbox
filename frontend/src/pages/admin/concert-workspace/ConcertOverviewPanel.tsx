import type { ReactNode } from 'react';
import { ClipboardCheck, ListChecks, ReceiptText, Ticket, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ConcertDetail } from '../../../api/concerts';
import { translate } from '../../../i18n';
import { money } from './workspaceFormat';
import type { WorkspaceTab } from './workspaceTabs';

export function ConcertOverviewPanel({
  concert,
  ticketStats,
  guestTotal,
  canViewOrders,
  orders,
  revenue,
  checkin,
  selectTab,
}: {
  concert: ConcertDetail;
  ticketStats: { inventory: number; available: number };
  guestTotal: number | undefined;
  canViewOrders: boolean;
  orders: unknown[] | null;
  revenue: number;
  checkin: { checkedIn: number; totalTickets: number } | null;
  selectTab: (tab: WorkspaceTab) => void;
}) {
  useTranslation();
  return (
    <section className="concert-workspace-grid">
      <Metric
        icon={<Ticket size={19} />}
        label={translate('admin:concertWorkspacePage_veConKhaDung_2')}
        value={`${ticketStats.available} / ${ticketStats.inventory}`}
        onOpen={() => selectTab('tickets')}
      />
      <Metric
        icon={<Users size={19} />}
        label={translate('admin:concertWorkspacePage_khachMoiTheoBoLoc')}
        value={
          guestTotal === undefined
            ? translate('admin:concertWorkspacePage_chuaCoDuLieu')
            : String(guestTotal)
        }
        onOpen={() => selectTab('guests')}
      />
      {canViewOrders ? (
        <Metric
          icon={<ReceiptText size={19} />}
          label={translate('admin:concertWorkspacePage_doanhThuDaThanhToan')}
          value={
            orders ? money.format(revenue) : translate('admin:concertWorkspacePage_chuaCoDuLieu')
          }
          onOpen={() => selectTab('operations')}
        />
      ) : null}
      <Metric
        icon={<ClipboardCheck size={19} />}
        label={translate('admin:concertWorkspacePage_daCheckIn')}
        value={
          checkin
            ? `${checkin.checkedIn} / ${checkin.totalTickets}`
            : translate('admin:concertWorkspacePage_chuaCoDuLieu')
        }
        onOpen={() => selectTab('operations')}
      />
      <section className="concert-workspace-card concert-workspace-card-wide">
        <div className="concert-card-heading">
          <div>
            <span>{translate('admin:concertWorkspacePage_viecCanHoanTat')}</span>
            <h2>{translate('admin:concertWorkspacePage_sanSangMoBan')}</h2>
          </div>
          <ListChecks size={20} />
        </div>
        <ul className="concert-readiness-list">
          <li className={concert.ticketTypes.length ? 'done' : ''}>
            {concert.ticketTypes.length
              ? translate('admin:concertWorkspacePage_daCoHangVe')
              : translate('admin:concertWorkspacePage_canTaoHangVe')}
          </li>
          <li className={concert.posterUrl ? 'done' : ''}>
            {concert.posterUrl
              ? translate('admin:concertWorkspacePage_daCoPoster')
              : translate('admin:concertWorkspacePage_canTaiPoster')}
          </li>
          <li className={concert.artistBio ? 'done' : ''}>
            {concert.artistBio
              ? translate('admin:concertWorkspacePage_daCoNoiDungNgheSi')
              : translate('admin:concertWorkspacePage_coTheBoSungArtistBio')}
          </li>
        </ul>
      </section>
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
  onOpen,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  onOpen: () => void;
}) {
  useTranslation();
  return (
    <button type="button" className="concert-workspace-metric" onClick={onOpen}>
      <span>{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
      <em>{translate('admin:concertWorkspacePage_xemChiTiet')}</em>
    </button>
  );
}
