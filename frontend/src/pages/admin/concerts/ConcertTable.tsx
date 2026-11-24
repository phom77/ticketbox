import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Edit3,
  ExternalLink,
  MapPin,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { CheckinSummary, ManagementApiScope } from '../../../api/admin';
import type { ConcertDetail, ConcertStatus, Page } from '../../../api/concerts';
import { ActionMenu } from '../../../components/admin/ActionMenu';
import { translate } from '../../../i18n';
import { dateTime, statusLabel } from './concertStatus';

/** The concert list with its loading and empty states, row actions and paging. */
export function ConcertTable({
  apiScope,
  pageData,
  loading,
  query,
  checkinSummaries,
  busyId,
  availableTransitions,
  changeStatus,
  openCreate,
  openEdit,
  setDeleteTarget,
  setPage,
}: {
  apiScope: ManagementApiScope;
  pageData: Page<ConcertDetail> | null;
  loading: boolean;
  query: string;
  checkinSummaries: Record<string, CheckinSummary>;
  busyId: string;
  availableTransitions: (concert: ConcertDetail) => ConcertStatus[];
  changeStatus: (concert: ConcertDetail, next: ConcertStatus) => void;
  openCreate: () => void;
  openEdit: (concert: ConcertDetail) => void;
  setDeleteTarget: (concert: ConcertDetail) => void;
  setPage: (update: (page: number) => number) => void;
}) {
  useTranslation();
  const filteredConcerts = pageData?.content ?? [];
  return (
    <>
      <section className="admin-data-panel">
        {loading ? (
          <ConcertRowsSkeleton />
        ) : filteredConcerts.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{translate('event')}</th>
                  {apiScope === 'admin' ? (
                    <th>{translate('admin:adminConcertsPage_checkIn')}</th>
                  ) : null}
                  <th>{translate('admin:adminConcertsPage_thoiGian')}</th>
                  <th>{translate('admin:adminConcertsPage_trangThai')}</th>
                  <th>{translate('admin:adminConcertsPage_dieuPhoi')}</th>
                  <th>
                    <span className="sr-only">{translate('admin:adminConcertsPage_thaoTac')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredConcerts.map((concert) => (
                  <tr key={concert.id}>
                    <td>
                      <div className="admin-concert-cell">
                        <div className="admin-concert-poster">
                          {concert.posterUrl ? (
                            <img src={concert.posterUrl} alt="" />
                          ) : (
                            <CalendarPlus size={20} />
                          )}
                        </div>
                        <div>
                          <strong>{concert.title}</strong>
                          <span>
                            <MapPin size={13} />
                            {concert.venueName}
                          </span>
                        </div>
                      </div>
                    </td>
                    {apiScope === 'admin' ? (
                      <td>
                        {checkinSummaries[concert.id] ? (
                          <>
                            <strong className="admin-table-primary">
                              {checkinSummaries[concert.id].checkedIn} /{' '}
                              {checkinSummaries[concert.id].totalTickets}
                            </strong>
                            <span className="admin-table-secondary">
                              Online {checkinSummaries[concert.id].onlineCheckins} · Offline{' '}
                              {checkinSummaries[concert.id].offlineCheckins}
                            </span>
                          </>
                        ) : (
                          <span className="admin-table-secondary">
                            {translate('admin:adminConcertsPage_dangTongHop')}
                          </span>
                        )}
                      </td>
                    ) : null}
                    <td>
                      <strong className="admin-table-primary">
                        {dateTime.format(new Date(concert.eventDate))}
                      </strong>
                      <span className="admin-table-secondary">
                        {translate('admin:adminConcertsPage_banVe')}{' '}
                        {dateTime.format(new Date(concert.saleStartAt))}
                      </span>
                      <span className="admin-table-secondary">
                        {concert.saleEndAt
                          ? translate('admin:adminConcertsPage_den', {
                              arg1: dateTime.format(new Date(concert.saleEndAt)),
                            })
                          : translate('admin:adminConcertsPage_denKhiConcertDienRa')}
                      </span>
                    </td>
                    <td>
                      <span className={`admin-status status-${concert.status.toLowerCase()}`}>
                        {apiScope === 'organizer' && concert.status === 'ON_SALE'
                          ? translate('admin:adminConcertsPage_daCauHinhMoBan')
                          : statusLabel(concert.status)}
                      </span>
                    </td>
                    <td>
                      <ActionMenu
                        label={translate('admin:adminConcertsPage_chuyenTrangThai')}
                        ariaLabel={translate('admin:adminConcertsPage_doiTrangThai', {
                          arg1: concert.title,
                        })}
                        disabled={!availableTransitions(concert).length || busyId === concert.id}
                        options={availableTransitions(concert).map((next) => ({
                          value: next,
                          label: statusLabel(next),
                          destructive: next === 'CANCELLED',
                        }))}
                        onSelect={(next) => changeStatus(concert, next)}
                      />
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        <Link
                          className="admin-row-link"
                          aria-label={translate('admin:adminConcertsPage_moKhongGianQuanLy', {
                            arg1: concert.title,
                          })}
                          to={`${apiScope === 'admin' ? '/admin' : '/organizer'}/concerts/${concert.id}`}
                        >
                          <ExternalLink size={16} />
                        </Link>
                        <button
                          type="button"
                          aria-label={translate('admin:adminConcertsPage_sua', {
                            arg1: concert.title,
                          })}
                          onClick={() => openEdit(concert)}
                          disabled={
                            busyId === concert.id ||
                            ['COMPLETED', 'CANCELLED'].includes(concert.status)
                          }
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          type="button"
                          aria-label={translate('admin:adminConcertsPage_xoa', {
                            arg1: concert.title,
                          })}
                          onClick={() => setDeleteTarget(concert)}
                          disabled={concert.status !== 'DRAFT' || busyId === concert.id}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="admin-empty-state">
            <CalendarPlus aria-hidden="true" size={28} />
            <h2>{translate('admin:adminConcertsPage_chuaCoConcertPhuHop')}</h2>
            <p>
              {query.trim()
                ? translate('admin:adminConcertsPage_thuDoiTuKhoaTimKiemHoac')
                : translate('admin:adminConcertsPage_thayDoiBoLocHoacTaoConcert')}
            </p>
            <button className="admin-primary-action" type="button" onClick={openCreate}>
              {translate('admin:adminConcertsPage_taoConcert')}
            </button>
          </div>
        )}
      </section>

      {pageData && pageData.totalPages > 1 ? (
        <div className="admin-pagination">
          <span>
            {translate('pageNumber', { page: pageData.number + 1, total: pageData.totalPages })}
          </span>
          <div>
            <button
              type="button"
              aria-label={translate('admin:adminConcertsPage_trangTruoc')}
              disabled={pageData.first}
              onClick={() => setPage((value) => value - 1)}
            >
              <ChevronLeft size={17} />
            </button>
            <button
              type="button"
              aria-label={translate('pageNext')}
              disabled={pageData.last}
              onClick={() => setPage((value) => value + 1)}
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ConcertRowsSkeleton() {
  useTranslation();
  return (
    <div
      className="admin-row-skeleton"
      aria-label={translate('admin:adminConcertsPage_dangTaiConcert')}
      aria-live="polite"
    >
      {[1, 2, 3, 4].map((item) => (
        <span key={item} />
      ))}
    </div>
  );
}
