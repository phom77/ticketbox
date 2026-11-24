import { FileUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { translate } from '../../../i18n';
import { SectionStatus } from './SectionStatus';
import type { useConcertGuests } from './useConcertGuests';
import { dateTime } from './workspaceFormat';

export function ConcertGuestsPanel({
  id,
  root,
  guests,
}: {
  id: string;
  root: string;
  guests: ReturnType<typeof useConcertGuests>;
}) {
  useTranslation();
  const {
    guestSection,
    guestTotal,
    visibleGuests,
    guestQuery,
    setGuestQuery,
    activeOnly,
    setActiveOnly,
    guestPageIndex,
    setGuestPageIndex,
    guestImportFile,
    chooseGuestImportFile,
    guestImportScheduled,
    setGuestImportScheduled,
    guestImporting,
    submitGuestImport,
  } = guests;
  return (
    <section className="concert-workspace-card">
      <div className="concert-card-heading">
        <div>
          <span>{translate('admin:concertWorkspacePage_danhSachKhachMoi')}</span>
          <h2>
            {guestTotal === undefined
              ? translate('admin:concertWorkspacePage_danhSachKhachMoi')
              : translate('admin:concertWorkspacePage_khachPhuHop', { count: guestTotal })}
          </h2>
        </div>
        <Link
          className="admin-secondary-action"
          to={`${root}/guests?concertId=${id}&returnTo=${encodeURIComponent(`${root}/concerts/${id}?tab=guests`)}`}
        >
          {translate('admin:concertWorkspacePage_lichSuBatch')}
        </Link>
      </div>
      <div className="concert-inline-action-panel">
        <div>
          <strong>{translate('admin:concertWorkspacePage_importCsvChoConcertNay')}</strong>
          <span>{translate('admin:concertWorkspacePage_chonFileDanhSachKhachImportNgay')}</span>
        </div>
        <label className="admin-secondary-action">
          <FileUp size={16} />
          {guestImportFile ? guestImportFile.name : translate('admin:concertWorkspacePage_chonCsv')}
          <input
            hidden
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              chooseGuestImportFile(event.target.files?.[0] ?? null);
              event.currentTarget.value = '';
            }}
          />
        </label>
        <label className="concert-inline-check">
          <input
            type="checkbox"
            checked={guestImportScheduled}
            onChange={(event) => setGuestImportScheduled(event.target.checked)}
          />{' '}
          {translate('admin:concertWorkspacePage_quaLichXuLy')}
        </label>
        <button
          className="admin-primary-action"
          type="button"
          disabled={!guestImportFile || guestImporting}
          onClick={() => void submitGuestImport()}
        >
          {guestImporting
            ? translate('admin:concertWorkspacePage_dangImport')
            : translate('admin:concertWorkspacePage_importVaoDanhSachKhach')}
        </button>
      </div>
      <div className="concert-workspace-toolbar">
        <input
          value={guestQuery}
          onChange={(e) => {
            setGuestQuery(e.target.value);
            setGuestPageIndex(0);
          }}
          placeholder={translate('admin:concertWorkspacePage_timTenSoDienThoaiHangHoac')}
        />
        <label>
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => {
              setActiveOnly(e.target.checked);
              setGuestPageIndex(0);
            }}
          />{' '}
          {translate('admin:concertWorkspacePage_chiKhachHieuLuc')}
        </label>
      </div>
      <SectionStatus {...guestSection} />
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{translate('admin:concertWorkspacePage_khachMoi')}</th>
              <th>{translate('admin:concertWorkspacePage_hang')}</th>
              <th>{translate('admin:concertWorkspacePage_donViMoi')}</th>
              <th>{translate('admin:concertWorkspacePage_trangThai')}</th>
              <th>{translate('admin:concertWorkspacePage_checkIn')}</th>
              <th>{translate('admin:concertWorkspacePage_ghiChu')}</th>
            </tr>
          </thead>
          <tbody>
            {visibleGuests.map((guest) => (
              <tr key={guest.id}>
                <td>
                  <strong>{guest.fullName}</strong>
                  <span className="admin-table-secondary">{guest.phone}</span>
                </td>
                <td>{guest.category ?? '—'}</td>
                <td>{guest.sponsorName ?? '—'}</td>
                <td>
                  <span
                    className={
                      guest.active ? 'status-badge badge-success' : 'status-badge badge-muted'
                    }
                  >
                    {guest.active
                      ? translate('admin:concertWorkspacePage_hieuLuc')
                      : translate('admin:concertWorkspacePage_daHuy')}
                  </span>
                </td>
                <td>
                  {guest.checkedInAt ? (
                    <>
                      <strong className="admin-table-primary">
                        {translate('admin:concertWorkspacePage_daVaoCong')}
                      </strong>
                      <span className="admin-table-secondary">
                        {guest.checkinGate ?? 'VIP'} ·{' '}
                        {dateTime.format(new Date(guest.checkedInAt))}
                      </span>
                    </>
                  ) : (
                    translate('admin:concertWorkspacePage_chuaVao')
                  )}
                </td>
                <td>{guest.notes ?? '—'}</td>
              </tr>
            ))}
            {guestSection.data && !visibleGuests.length ? (
              <tr>
                <td colSpan={6} className="concert-empty-row">
                  {translate('admin:concertWorkspacePage_chuaCoKhachMoiPhuHop')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {guestSection.data && guestSection.data.totalPages > 1 ? (
        <div className="organization-form">
          <button
            type="button"
            className="admin-secondary-action"
            disabled={guestPageIndex === 0}
            onClick={() => setGuestPageIndex((page) => page - 1)}
          >
            {translate('admin:concertWorkspacePage_trangTruoc')}
          </button>
          <span>
            {translate('pageNumber', {
              page: guestPageIndex + 1,
              total: guestSection.data.totalPages,
            })}
          </span>
          <button
            type="button"
            className="admin-secondary-action"
            disabled={guestSection.data.last}
            onClick={() => setGuestPageIndex((page) => page + 1)}
          >
            {translate('pageNext')}
          </button>
        </div>
      ) : null}
    </section>
  );
}
