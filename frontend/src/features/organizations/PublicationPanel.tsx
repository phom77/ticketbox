import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { ManagementApiScope } from '../../api/admin';
import {
  decidePublication, getPublication, holdPublication, submitPublication, type Publication,
} from '../../api/publication';
import { dateFormatter } from '../../data/formatters';

const timeZone = 'Asia/Ho_Chi_Minh';
const timeFormat = dateFormatter({ dateStyle: 'medium', timeStyle: 'short', timeZone });
const localTime = new Intl.DateTimeFormat('sv-SE', {
  timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});

const issues: Record<string, string> = {
  EVENT_DETAILS: 'shared:publicationPanel_boSungTenVaDiaDiemBuoi',
  SALE_WINDOW: 'shared:publicationPanel_kiemTraNgayDienVaThoiGian',
  ACTIVE_TIER: 'shared:publicationPanel_themHangVeDangHoatDongVoi',
  EVENT_STATUS: 'shared:publicationPanel_trangThaiBuoiDienHienTaiChua',
};

export function PublicationPanel({ id, scope, updatedAt, saleStartAt, onPublished }: {
  id: string;
  scope: ManagementApiScope;
  updatedAt: string;
  saleStartAt: string;
  onPublished: () => void;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<Publication | null>(null);
  const [publishAt, setPublishAt] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const review = state?.review;
  const target = state?.versions.activationVersion ?? state?.versions.version ?? 0;
  const ticketingReady = (state?.versions.ticketingVersion ?? 0) >= target;
  const checkinReady = (state?.versions.checkinVersion ?? 0) >= target;
  const monitor = review?.state === 'SUBMITTED' || review?.state === 'SCHEDULED'
    || (review?.state === 'RELEASED' && (!ticketingReady || !checkinReady));

  useEffect(() => {
    const controller = new AbortController();
    function fetchStatus() {
      void getPublication(id, scope, controller.signal).then((result) => {
        if (!controller.signal.aborted) setState(result);
      }).catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : t('shared:publicationPanel_khongTheTaiTrangThaiMoBan'));
      });
    }
    fetchStatus();
    const timer = monitor ? window.setInterval(fetchStatus, 4000) : undefined;
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [id, scope, updatedAt, reload, monitor, t]);

  async function change(action: () => Promise<Publication>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      setState(await action());
      setReason('');
      onPublished();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('shared:publicationPanel_khongTheTaiTrangThaiMoBan'));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (publishAt) void change(() => submitPublication(id, scope, `${publishAt}:00+07:00`));
  }

  const reopening = state?.status !== 'DRAFT' && (review?.state === 'HELD' || review?.resumeHold === true)
    && review?.state !== 'RELEASED';
  const canSubmit = !!state && (state.status === 'DRAFT' || state.draftEdit || reopening) && state.issues.length === 0;
  const canDecide = scope === 'admin' && review?.state === 'SUBMITTED';
  const canHold = scope === 'admin' && (review?.state === 'SCHEDULED'
    || (state?.status === 'ON_SALE' && !reopening && !!review));
  const late = review?.state === 'SCHEDULED' && Date.parse(review.publishAt) <= Date.now();
  const releaseState = late || (review?.state === 'RELEASED' && !ticketingReady) ? 'PENDING' : review?.state;
  const proposed = review?.proposedEdit;

  return (
    <section className="admin-data-panel organization-panel" aria-labelledby="sale-publication">
      <h2 id="sale-publication">{t('shared:releaseTitle')}</h2>
      {scope === 'organizer' ? (
        <Link className="admin-secondary-action" to={`/organizer/concerts/${id}/preview`}>{t('shared:publicationPanel_xemTruoc')}</Link>
      ) : null}
      {error ? <p role="alert">{error} <button type="button" className="admin-secondary-action" onClick={() => {
        setError(''); setReload((value) => value + 1);
      }}>{t('shared:publicationPanel_kiemTraLai')}</button></p> : null}
      {!state && !error ? <p role="status">{t('shared:publicationPanel_dangKiemTraDieuKienMoBan')}</p> : null}
      {releaseState ? <p role="status"><strong>{t(`shared:release_${releaseState}`)}</strong></p> : null}
      {review ? <p>{t('shared:releasePublishAt')} · {timeFormat.format(new Date(review.publishAt))} (ICT)</p> : null}
      <p>{t('shared:releaseSaleAt')} · {timeFormat.format(new Date(saleStartAt))} (ICT)</p>
      {review?.reason ? <p>{t('shared:releaseReason')} · {review.reason}</p> : null}
      {proposed && canDecide ? <div className="publication-edit-preview">
        <h3>{t('shared:releaseProposedEdit')}</h3>
        {proposed.details ? <>
          <p><strong>{proposed.details.original?.title || proposed.details.title}</strong></p>
          <p>{proposed.details.original?.description || proposed.details.description}</p>
          <p>{proposed.details.venueName} · {proposed.details.venueAddress}</p>
        </> : null}
        {Object.entries(proposed.details?.translations ?? {}).map(([locale, item]) => <div key={locale} lang={locale}>
          <strong>{locale.toUpperCase()} · {item.title}</strong>
          {item.description ? <p>{item.description}</p> : null}
        </div>)}
        {proposed.poster ? proposed.poster.url
          ? <a href={proposed.poster.url} target="_blank" rel="noreferrer">{t('shared:releasePoster')}</a>
          : <p>{t('shared:releaseRemovePoster')}</p> : null}
        {proposed.artistBio ? <p>{proposed.artistBio}</p> : null}
      </div> : null}
      {state?.issues.length ? <ul>{state.issues.map((issue) => <li key={issue}>{issues[issue] ? t(issues[issue]) : issue}</li>)}</ul> : null}
      {canSubmit ? (
        <form className="organization-form" onSubmit={submit}>
          <label className="admin-field">{t('shared:releasePublishAt')} (ICT)
            <input type="datetime-local" value={publishAt} required
              max={state?.draftEdit || reopening ? undefined : localTime.format(new Date(saleStartAt)).replace(' ', 'T')}
              onChange={(event) => setPublishAt(event.target.value)} />
          </label>
          <button className="admin-primary-action" disabled={busy || !publishAt}>{t('shared:releaseSend')}</button>
        </form>
      ) : null}
      {(canDecide || canHold) && review ? (
        <div className="organization-form">
          <label className="admin-field">{t('shared:releaseReason')}
            <input value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} />
          </label>
          {canDecide ? <>
            <button type="button" className="admin-primary-action" disabled={busy}
              onClick={() => void change(() => decidePublication(id, review.id, 'APPROVE', reason))}>{t('shared:releaseApprove')}</button>
            <button type="button" className="admin-secondary-action" disabled={busy || !reason.trim()}
              onClick={() => void change(() => decidePublication(id, review.id, 'REQUEST_CHANGES', reason))}>{t('shared:releaseRequestChanges')}</button>
            <button type="button" className="admin-secondary-action" disabled={busy || !reason.trim()}
              onClick={() => void change(() => decidePublication(id, review.id, 'REJECT', reason))}>{t('shared:releaseReject')}</button>
          </> : null}
          {canHold ? <button type="button" className="admin-secondary-action" disabled={busy || !reason.trim()}
            onClick={() => void change(() => holdPublication(id, review.id, reason))}>{t('shared:releaseHold')}</button> : null}
        </div>
      ) : null}
      {state ? <p>Ticketing · {t(ticketingReady ? 'shared:publicationPanel_daDongBo' : 'shared:publicationPanel_dangDongBo')}
        {' · '}Check-in · {t(checkinReady ? 'shared:publicationPanel_daDongBo' : 'shared:publicationPanel_dangDongBo')}</p> : null}
    </section>
  );
}
