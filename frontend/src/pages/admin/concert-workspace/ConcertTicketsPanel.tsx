import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { ConcertDetail } from '../../../api/concerts';
import { translate } from '../../../i18n';
import { money } from './workspaceFormat';

export function ConcertTicketsPanel({ concert, root }: { concert: ConcertDetail; root: string }) {
  useTranslation();
  const id = concert.id;
  return (
    <section className="concert-workspace-card">
      <div className="concert-card-heading">
        <div>
          <span>{translate('admin:concertWorkspacePage_inventory')}</span>
          <h2>{translate('admin:concertWorkspacePage_hangVeVaTonKho')}</h2>
        </div>
        <Link
          className="admin-primary-action"
          to={`${root}/ticket-types?concertId=${id}&returnTo=${encodeURIComponent(`${root}/concerts/${id}?tab=tickets`)}`}
        >
          {translate('admin:concertWorkspacePage_quanLyHangVe')}
        </Link>
      </div>
      <p className="concert-workspace-hint">
        {translate('admin:concertWorkspacePage_cacHangVeBenDuoiLayTruc')}
      </p>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{translate('admin:concertWorkspacePage_hangVe')}</th>
              <th>{translate('admin:concertWorkspacePage_gia')}</th>
              <th>{translate('admin:concertWorkspacePage_tonKho')}</th>
              <th>{translate('admin:concertWorkspacePage_trangThai')}</th>
            </tr>
          </thead>
          <tbody>
            {concert.ticketTypes.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.name}</strong>
                </td>
                <td>{money.format(item.price)}</td>
                <td>
                  {item.availableQty} / {item.totalQuantity}
                </td>
                <td>
                  <span
                    className={
                      item.isActive ? 'status-badge badge-success' : 'status-badge badge-muted'
                    }
                  >
                    {item.isActive
                      ? translate('admin:concertWorkspacePage_dangHoatDong')
                      : translate('admin:concertWorkspacePage_tamNgung')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
