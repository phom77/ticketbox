import type { FormEvent } from 'react';
import { FileUp, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ConcertMutation, ManagementApiScope } from '../../../api/admin';
import type { ConcertDetail } from '../../../api/concerts';
import { ConcertTextFields } from '../../../features/concert/ConcertTextFields';
import { translate } from '../../../i18n';

export function ConcertDetailsPanel({
  concert,
  form,
  setForm,
  apiScope,
  saving,
  uploadingPoster,
  saveDetails,
  replacePoster,
}: {
  concert: ConcertDetail;
  form: ConcertMutation;
  setForm: (form: ConcertMutation) => void;
  apiScope: ManagementApiScope;
  saving: boolean;
  uploadingPoster: boolean;
  saveDetails: (event: FormEvent) => void;
  replacePoster: (file: File | null) => void;
}) {
  useTranslation();
  return (
    <form className="concert-settings-form" onSubmit={saveDetails}>
      <div className="concert-workspace-card concert-workspace-card-wide">
        <div className="concert-card-heading">
          <div>
            <span>{translate('admin:concertWorkspacePage_cauHinhCoBan')}</span>
            <h2>{translate('admin:concertWorkspacePage_thongTinLichTrinhVaSoDo')}</h2>
          </div>
          <Settings2 size={20} />
        </div>
        <div className="admin-form-grid">
          <ConcertTextFields
            original={form.original}
            translations={form.translations}
            onChange={(text) => setForm({ ...form, ...text })}
          />
          <label className="admin-field">
            <span>{translate('admin:concertWorkspacePage_thoiGianDien')}</span>
            <input
              required
              type="datetime-local"
              readOnly={concert.status !== 'DRAFT'}
              value={form.eventDate}
              onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>{translate('admin:concertWorkspacePage_moCua')}</span>
            <input
              type="datetime-local"
              readOnly={concert.status !== 'DRAFT'}
              value={form.doorsOpenAt ?? ''}
              onChange={(e) => setForm({ ...form, doorsOpenAt: e.target.value || null })}
            />
          </label>
          <label className="admin-field">
            <span>{translate('admin:concertWorkspacePage_moBanVe')}</span>
            <input
              required
              type="datetime-local"
              readOnly={concert.status !== 'DRAFT'}
              value={form.saleStartAt}
              onChange={(e) => setForm({ ...form, saleStartAt: e.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>{translate('admin:concertWorkspacePage_ketThucBan_2')}</span>
            <input
              type="datetime-local"
              readOnly={concert.status !== 'DRAFT'}
              value={form.saleEndAt ?? ''}
              onChange={(e) => setForm({ ...form, saleEndAt: e.target.value || null })}
            />
          </label>
          {(concert.status === 'ON_SALE' || concert.status === 'SOLD_OUT') && (
            <p className="admin-field-wide">
              {apiScope === 'admin'
                ? translate('admin:concertWorkspacePage_doiLichTrongMucDonHangCheck')
                : translate('admin:concertWorkspacePage_lienHeTicketboxDeDoiLichSau')}
            </p>
          )}
          <label className="admin-field">
            <span>{translate('admin:concertWorkspacePage_diaDiem')}</span>
            <input
              required
              value={form.venueName}
              onChange={(e) => setForm({ ...form, venueName: e.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>{translate('admin:concertWorkspacePage_diaChi')}</span>
            <input
              required
              value={form.venueAddress}
              onChange={(e) => setForm({ ...form, venueAddress: e.target.value })}
            />
          </label>
          <label className="admin-field admin-field-wide">
            <span>{translate('admin:concertWorkspacePage_soDoChoSvg')}</span>
            <textarea
              rows={5}
              value={form.seatMapSvg ?? ''}
              onChange={(e) => setForm({ ...form, seatMapSvg: e.target.value || null })}
              placeholder={translate('admin:concertWorkspacePage_danNoiDungSvgDaDuocKiem')}
            />
          </label>
        </div>
        <footer>
          <label className="admin-secondary-action">
            <FileUp size={16} />
            {uploadingPoster
              ? translate('admin:concertWorkspacePage_dangTaiPoster')
              : translate('admin:concertWorkspacePage_replacePoster')}
            <input
              hidden
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={uploadingPoster}
              onChange={(e) => replacePoster(e.target.files?.[0] ?? null)}
            />
          </label>
          <button className="admin-primary-action" disabled={saving}>
            {saving
              ? translate('admin:concertWorkspacePage_dangLuu')
              : translate('admin:concertWorkspacePage_luuCauHinh')}
          </button>
        </footer>
      </div>
    </form>
  );
}
