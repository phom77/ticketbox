import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { CheckinSummary } from '../../../api/admin';
import type { Order } from '../../../api/orders';
import type { WorkspaceSection } from './useWorkspaceSection';
import { translate } from '../../../i18n';
import { SectionStatus } from './SectionStatus';
import { money } from './workspaceFormat';

export function ConcertOperationsPanel({
  id,
  root,
  canViewOrders,
  checkinSection,
  orderSection,
  paidOrders,
  revenue,
}: {
  id: string;
  root: string;
  canViewOrders: boolean;
  checkinSection: WorkspaceSection<CheckinSummary>;
  orderSection: WorkspaceSection<Order[]>;
  paidOrders: Order[];
  revenue: number;
}) {
  useTranslation();
  const checkin = checkinSection.data;
  const orders = orderSection.data;
  return (
    <section className="concert-workspace-grid">
      <section className="concert-workspace-card">
        <div className="concert-card-heading">
          <div>
            <span>{translate('admin:concertWorkspacePage_checkIn')}</span>
            <h2>{translate('admin:concertWorkspacePage_vanHanhTaiCong')}</h2>
          </div>
          {canViewOrders ? (
            <Link className="admin-secondary-action" to={`${root}/orders?concertId=${id}`}>
              {translate('admin:concertWorkspacePage_xemVe')}
            </Link>
          ) : null}
        </div>
        <SectionStatus {...checkinSection} />
        {checkin ? (
          <dl className="concert-definition-list">
            <div>
              <dt>{translate('admin:concertWorkspacePage_tongVe')}</dt>
              <dd>{checkin.totalTickets}</dd>
            </div>
            <div>
              <dt>{translate('admin:concertWorkspacePage_daVaoCong')}</dt>
              <dd>{checkin.checkedIn}</dd>
            </div>
            <div>
              <dt>Online / Offline</dt>
              <dd>{`${checkin.onlineCheckins} / ${checkin.offlineCheckins}`}</dd>
            </div>
          </dl>
        ) : null}
      </section>
      {canViewOrders ? (
        <section className="concert-workspace-card">
          <div className="concert-card-heading">
            <div>
              <span>{translate('admin:concertWorkspacePage_donHang')}</span>
              <h2>
                {orders
                  ? translate('admin:concertWorkspacePage_donPhatSinh', {
                      count: orders.length,
                    })
                  : translate('admin:concertWorkspacePage_donHang')}
              </h2>
            </div>
            <Link className="admin-secondary-action" to={`${root}/orders?concertId=${id}`}>
              {translate('admin:concertWorkspacePage_xemDonHang')}
            </Link>
          </div>
          <SectionStatus {...orderSection} />
          {orders ? (
            <dl className="concert-definition-list">
              <div>
                <dt>{translate('admin:concertWorkspacePage_daThanhToan')}</dt>
                <dd>{paidOrders.length}</dd>
              </div>
              <div>
                <dt>{translate('admin:concertWorkspacePage_choThanhToan')}</dt>
                <dd>{orders.filter((order) => order.status === 'AWAITING_PAYMENT').length}</dd>
              </div>
              <div>
                <dt>{translate('revenue')}</dt>
                <dd>{money.format(revenue)}</dd>
              </div>
            </dl>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
