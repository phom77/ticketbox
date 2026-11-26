import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { ImagePlus, Map, X } from 'lucide-react';
import DOMPurify from 'dompurify';
import { useTranslation } from 'react-i18next';
import type { ConcertDetail } from '../../../api/concerts';
import { WorkspaceSelect } from '../../../components/WorkspaceSelect';
import { ModalPortal } from '../../../components/feedback/ModalPortal';
import { useToast } from '../../../components/feedback/toast-context';
import { ConcertTextFields } from '../../../features/concert/ConcertTextFields';
import { eventCategories } from '../../../features/discovery/categories';
import { translate } from '../../../i18n';
import type { ConcertFormState } from './concertForm';

/** Create or edit dialog for a concert, with poster and SVG seat map pickers. */
export function ConcertForm({
  form,
  editing,
  saving,
  canSave,
  removingPoster,
  posterFile,
  onChange,
  onPosterChange,
  onRemovePoster,
  onClose,
  onSubmit,
  ownerField,
}: {
  form: ConcertFormState;
  editing: ConcertDetail | null;
  saving: boolean;
  canSave: boolean;
  removingPoster: boolean;
  posterFile: File | null;
  onChange: (form: ConcertFormState) => void;
  onPosterChange: (file: File | null) => void;
  onRemovePoster: () => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  ownerField: ReactNode;
}) {
  useTranslation();
  const toast = useToast();
  const [selectedPosterPreview, setSelectedPosterPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!posterFile) {
      setSelectedPosterPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(posterFile);
    setSelectedPosterPreview(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [posterFile]);

  const posterPreview = selectedPosterPreview ?? editing?.posterUrl ?? null;

  const field = (
    name: Exclude<keyof ConcertFormState, 'original' | 'translations' | 'category'>,
  ) => ({
    value: form[name],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange({ ...form, [name]: event.target.value }),
  });

  const handleSvgUpload = (file: File | null) => {
    if (!file) {
      return;
    }
    if (file.type !== 'image/svg+xml') {
      toast.error(translate('admin:adminConcertsPage_vuiLongChonFileSvgHopLe'));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error(translate('admin:adminConcertsPage_fileSvgKhongDuocVuotQua2'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const sanitized = DOMPurify.sanitize(text, {
        USE_PROFILES: { svg: true, svgFilters: true },
      });
      onChange({ ...form, seatMapSvg: sanitized });
    };
    reader.readAsText(file);
  };

  const dialog = (
    <div className="admin-dialog-backdrop" role="presentation">
      <section
        className="admin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="concert-form-title"
      >
        <header>
          <div>
            <span>
              {editing
                ? translate('admin:adminConcertsPage_chinhSuaChuongTrinh')
                : translate('admin:adminConcertsPage_chuongTrinhMoi')}
            </span>
            <h2 id="concert-form-title">
              {editing ? editing.title : translate('admin:adminConcertsPage_taoConcert')}
            </h2>
          </div>
          <button
            type="button"
            aria-label={translate('admin:adminConcertsPage_dong')}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <form onSubmit={onSubmit}>
          <div className="admin-form-grid">
            {ownerField}
            <ConcertTextFields
              original={form.original}
              translations={form.translations}
              onChange={(text) => onChange({ ...form, ...text })}
            />
            <label className="admin-field">
              <span>{translate('performances:categoryOptional')}</span>
              <WorkspaceSelect
                label={translate('performances:categoryOptional')}
                value={form.category}
                options={[
                  { value: '', label: translate('performances:categoryNone') },
                  ...eventCategories.map((entry) => ({
                    value: entry.id,
                    label: translate(entry.label),
                  })),
                ]}
                onChange={(category) => onChange({ ...form, category })}
              />
            </label>
            <label className="admin-field">
              <span>{translate('admin:adminConcertsPage_thoiGianDienRa')}</span>
              <input required type="datetime-local" {...field('eventDate')} />
            </label>
            <label className="admin-field">
              <span>{translate('admin:adminConcertsPage_gioMoCua')}</span>
              <input type="datetime-local" {...field('doorsOpenAt')} />
            </label>
            <label className="admin-field">
              <span>{translate('admin:adminConcertsPage_batDauBanVe')}</span>
              <input required type="datetime-local" {...field('saleStartAt')} />
            </label>
            <label className="admin-field">
              <span>{translate('admin:adminConcertsPage_ketThucBanVe')}</span>
              <input type="datetime-local" {...field('saleEndAt')} />
            </label>
            <label className="admin-field">
              <span>{translate('admin:adminConcertsPage_diaDiem')}</span>
              <input required {...field('venueName')} />
            </label>
            <label className="admin-field">
              <span>{translate('admin:adminConcertsPage_diaChi')}</span>
              <input required {...field('venueAddress')} />
            </label>
            <div className="admin-field admin-field-wide">
              <span>{translate('eventPoster')}</span>
              <div className="admin-poster-field">
                <div className="admin-poster-preview">
                  {posterPreview ? (
                    <img
                      src={posterPreview}
                      alt={translate('admin:adminConcertsPage_xemTruocPosterConcert')}
                    />
                  ) : (
                    <ImagePlus aria-hidden="true" size={25} />
                  )}
                </div>
                <div className="admin-poster-controls">
                  <label className="admin-secondary-action">
                    <ImagePlus aria-hidden="true" size={16} />
                    {posterPreview
                      ? translate('admin:adminConcertsPage_doiPoster')
                      : translate('admin:adminConcertsPage_chonPoster')}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => onPosterChange(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  {posterFile ? (
                    <button
                      className="admin-secondary-action"
                      type="button"
                      onClick={() => onPosterChange(null)}
                    >
                      {translate('admin:adminConcertsPage_boAnhDaChon')}
                    </button>
                  ) : editing?.posterUrl ? (
                    <button
                      className="admin-secondary-action"
                      type="button"
                      onClick={onRemovePoster}
                      disabled={removingPoster}
                    >
                      {removingPoster
                        ? translate('admin:adminConcertsPage_dangXoa')
                        : translate('admin:adminConcertsPage_xoaPoster')}
                    </button>
                  ) : null}
                  <small>{translate('admin:adminConcertsPage_jpegPngHoacWebpToiDa5')}</small>
                </div>
              </div>
            </div>
            <div className="admin-field admin-field-wide">
              <span>{translate('admin:adminConcertsPage_soDoChoSvg')}</span>
              <div className="admin-poster-field">
                <div className="admin-poster-preview">
                  {form.seatMapSvg ? (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      dangerouslySetInnerHTML={{ __html: form.seatMapSvg }}
                    />
                  ) : (
                    <Map aria-hidden="true" size={25} />
                  )}
                </div>
                <div className="admin-poster-controls">
                  <label className="admin-secondary-action">
                    <Map aria-hidden="true" size={16} />
                    {form.seatMapSvg
                      ? translate('admin:adminConcertsPage_doiSoDo')
                      : translate('admin:adminConcertsPage_chonSoDoSvg')}
                    <input
                      type="file"
                      accept=".svg,image/svg+xml"
                      onChange={(event) => {
                        handleSvgUpload(event.target.files?.[0] ?? null);
                        event.target.value = ''; // Reset input to allow re-uploading the same file
                      }}
                    />
                  </label>
                  {form.seatMapSvg ? (
                    <button
                      className="admin-secondary-action"
                      type="button"
                      onClick={() => onChange({ ...form, seatMapSvg: '' })}
                    >
                      {translate('admin:adminConcertsPage_xoaSoDo')}
                    </button>
                  ) : null}
                  <small>{translate('admin:adminConcertsPage_dinhDangSvgToiDa2Mb')}</small>
                </div>
              </div>
            </div>
          </div>
          <footer>
            <button className="admin-secondary-action" type="button" onClick={onClose}>
              {translate('admin:adminConcertsPage_huy')}
            </button>
            <button className="admin-primary-action" type="submit" disabled={saving || !canSave}>
              {saving
                ? translate('admin:adminConcertsPage_dangLuu')
                : editing
                  ? translate('admin:adminConcertsPage_luuThayDoi')
                  : translate('admin:adminConcertsPage_taoBanNhap')}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );

  return <ModalPortal>{dialog}</ModalPortal>;
}
