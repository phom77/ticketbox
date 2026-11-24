import { FileUp, Music2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { ConcertDetail } from '../../../api/concerts';
import { translate } from '../../../i18n';
import { SectionStatus } from './SectionStatus';
import type { useConcertArtistBio } from './useConcertArtistBio';
import { dateTime } from './workspaceFormat';

export function ConcertArtistPanel({
  concert,
  root,
  artist,
}: {
  concert: ConcertDetail;
  root: string;
  artist: ReturnType<typeof useConcertArtistBio>;
}) {
  useTranslation();
  const id = concert.id;
  const {
    artistSection,
    artistJobs,
    selectedArtistSourceIds,
    toggleArtistSource,
    combiningArtistSources,
    combineArtistSources,
    artistBioDraft,
    setArtistBioDraft,
    publishingArtistBio,
    publishArtistBio,
    uploadingArtistSources,
    uploadArtistSources,
  } = artist;
  return (
    <section className="concert-workspace-card artist-content-workspace">
      <SectionStatus {...artistSection} />
      <div className="concert-card-heading">
        <div>
          <span>{translate('admin:concertWorkspacePage_ngheSiNoiDungCongKhai')}</span>
          <h2>{translate('admin:concertWorkspacePage_bienTapTruocKhiXuatBan')}</h2>
        </div>
        <Link
          className="admin-secondary-action"
          to={`${root}/artist-bio?concertId=${id}&returnTo=${encodeURIComponent(`${root}/concerts/${id}?tab=artist`)}`}
        >
          {translate('admin:concertWorkspacePage_lichSuAiDayDu')}
        </Link>
      </div>
      <p className="artist-content-intro">
        {translate('admin:concertWorkspacePage_moiPdfTaoMotBanNhapNguon')}
      </p>
      <div className="artist-content-grid">
        <section>
          <div className="artist-content-section-heading">
            <div>
              <strong>{translate('admin:concertWorkspacePage_nguonThamKhao')}</strong>
              <span>{translate('admin:concertWorkspacePage_coTheThemNhieuPressKitHoac')}</span>
            </div>
            <label className="admin-primary-action">
              <FileUp size={16} />
              {uploadingArtistSources
                ? translate('admin:concertWorkspacePage_dangGui')
                : translate('admin:concertWorkspacePage_themTaiLieuPdf')}
              <input
                hidden
                type="file"
                multiple
                accept="application/pdf"
                disabled={uploadingArtistSources}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.currentTarget.value = '';
                  void uploadArtistSources(files);
                }}
              />
            </label>
          </div>
          <div className="concert-artist-jobs">
            {artistJobs.map((job) => (
              <div key={job.id} className="artist-source-item">
                {job.status === 'DONE' && job.resultBio ? (
                  <input
                    className="artist-source-checkbox"
                    type="checkbox"
                    checked={selectedArtistSourceIds.includes(job.id)}
                    onChange={() => toggleArtistSource(job.id)}
                    aria-label={translate('admin:concertWorkspacePage_chonDeTongHop', {
                      arg1: job.originalFileName,
                    })}
                  />
                ) : null}
                <Music2 size={17} />
                <span>
                  <strong>{job.originalFileName}</strong>
                  <small>
                    {job.status} · {dateTime.format(new Date(job.createdAt))}
                  </small>
                </span>
                {job.status === 'DONE' && job.resultBio ? (
                  <button
                    type="button"
                    className="admin-secondary-action"
                    onClick={() => setArtistBioDraft(job.resultBio ?? '')}
                  >
                    {translate('admin:concertWorkspacePage_xemRieng')}
                  </button>
                ) : null}
              </div>
            ))}
            {!artistJobs.length ? (
              <p>{translate('admin:concertWorkspacePage_chuaCoTaiLieuNguonThemPress')}</p>
            ) : null}
          </div>
          <button
            className="admin-primary-action artist-combine-action"
            type="button"
            disabled={selectedArtistSourceIds.length < 2 || combiningArtistSources}
            onClick={() => void combineArtistSources()}
          >
            {combiningArtistSources
              ? translate('admin:concertWorkspacePage_dangTongHop')
              : translate('admin:concertWorkspacePage_tongHopNguonDaChon', {
                  arg1: selectedArtistSourceIds.length,
                })}
          </button>
        </section>
        <section className="artist-publish-panel">
          <div className="artist-content-section-heading">
            <div>
              <strong>{translate('admin:concertWorkspacePage_noiDungSeHienThiCongKhai')}</strong>
              <span>{translate('admin:concertWorkspacePage_khanGiaXemPhanNayTruocKhi')}</span>
            </div>
            <span
              className={
                concert.artistBio ? 'status-badge badge-success' : 'status-badge badge-muted'
              }
            >
              {concert.artistBio
                ? translate('admin:concertWorkspacePage_daXuatBan')
                : translate('admin:concertWorkspacePage_banNhap')}
            </span>
          </div>
          <textarea
            value={artistBioDraft}
            maxLength={2000}
            rows={9}
            onChange={(event) => setArtistBioDraft(event.target.value)}
            placeholder={translate('admin:concertWorkspacePage_tongHopCacNguonHoacTuViet')}
          />
          <div className="artist-publish-footer">
            <span>
              {artistBioDraft.length}
              {translate('admin:concertWorkspacePage_2000KyTu')}
            </span>
            <button
              className="admin-primary-action"
              type="button"
              disabled={!artistBioDraft.trim() || publishingArtistBio}
              onClick={() => void publishArtistBio()}
            >
              {publishingArtistBio
                ? translate('admin:concertWorkspacePage_dangXuatBan')
                : translate('admin:concertWorkspacePage_xuatBanLenTrangConcert')}
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}
