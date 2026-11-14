import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPublication, publishConcert, type Publication } from '../../api/publication';

const issueText: Record<string, string> = {
  get EVENT_DETAILS() { return translate("shared:publicationPanel_boSungTenVaDiaDiemBuoi"); },
  get SALE_WINDOW() { return translate("shared:publicationPanel_kiemTraNgayDienVaThoiGian"); },
  get ACTIVE_TIER() { return translate("shared:publicationPanel_themHangVeDangHoatDongVoi"); },
  get EVENT_STATUS() { return translate("shared:publicationPanel_trangThaiBuoiDienHienTaiChua"); },
};

export function PublicationPanel({
  id, updatedAt, onPublished,
}: { id: string; updatedAt: string; onPublished: () => void }) {
  useTranslation();
  const [state, setState] = useState<Publication | null>(null);
  const [error, setError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [reload, setReload] = useState(0);

  const refresh = useCallback(() => setReload((current) => current + 1), []);
  const target = state?.versions.activationVersion ?? state?.versions.version ?? 0;
  const pending = !!state && (state.versions.ticketingVersion < target || state.versions.checkinVersion < target);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void getPublication(id, controller.signal).then((result) => {
        if (!controller.signal.aborted) { setState(result); setError(''); }
      }).catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : translate("shared:publicationPanel_khongTheTaiTrangThaiMoBan"));
      });
    }, pending ? 1500 : 0);
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [id, pending, reload, updatedAt]);

  useEffect(() => {
    if (!pending || error) return;
    const timer = window.setTimeout(refresh, 3000);
    return () => window.clearTimeout(timer);
  }, [pending, error, refresh, state]);

  async function publish() {
    if (publishing) return;
    setPublishing(true);
    setError('');
    try {
      const result = await publishConcert(id);
      setState(result);
      onPublished();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : translate("shared:publicationPanel_khongTheMoBan"));
      refresh();
    } finally {
      setPublishing(false);
    }
  }

  return (
    <section className="admin-data-panel organization-panel" aria-labelledby="sale-publication">
      <h2 id="sale-publication">{translate("shared:publicationPanel_moBan")}</h2>
      <div className="organization-form">
        <Link className="admin-secondary-action" to={`/organizer/concerts/${id}/preview`}>{translate("shared:publicationPanel_xemTruoc")}</Link>
        {state?.status === 'DRAFT' ? (
          <button className="admin-primary-action" type="button" onClick={() => void publish()}
            disabled={publishing || !!error || state.issues.length > 0}>
            {publishing ? translate("shared:publicationPanel_dangMoBan") : translate("shared:publicationPanel_xacNhanMoBan")}
          </button>
        ) : null}
      </div>
      {error ? <p role="alert">{error} <button type="button" className="admin-secondary-action" onClick={refresh}>{translate("shared:publicationPanel_kiemTraLai")}</button></p> : null}
      {!state && !error ? <p role="status">{translate("shared:publicationPanel_dangKiemTraDieuKienMoBan")}</p> : null}
      {state ? (
        <>
          {state.issues.length > 0 ? <ul>{state.issues.map((issue) => <li key={issue}>{issueText[issue] ?? issue}</li>)}</ul> : null}
          <p role="status">Ticketing {state.versions.ticketingVersion >= target ? translate("shared:publicationPanel_daDongBo") : translate("shared:publicationPanel_dangDongBo")} · Check-in {state.versions.checkinVersion >= target ? translate("shared:publicationPanel_daDongBo") : translate("shared:publicationPanel_dangDongBo")}</p>
          {state.status === 'ON_SALE' ? <p>{state.versions.ticketingVersion >= target
            ? translate("shared:publicationPanel_buoiDienDaDuocCongKhaiTheo")
            : translate("shared:publicationPanel_daLuuYeuCauBuoiDienSe")}</p> : null}
        </>
      ) : null}
      <p>{translate("shared:publicationPanel_deHoanHoacHuyBuoiDienLien")}</p>
    </section>
  );
}
