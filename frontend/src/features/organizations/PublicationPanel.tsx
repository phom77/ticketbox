import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPublication, publishConcert, type Publication } from '../../api/publication';

const issueText: Record<string, string> = {
  EVENT_DETAILS: 'Bổ sung tên và địa điểm buổi diễn.',
  SALE_WINDOW: 'Kiểm tra ngày diễn và thời gian mở bán.',
  ACTIVE_TIER: 'Thêm hạng vé đang hoạt động với giá, số lượng và giới hạn hợp lệ.',
  EVENT_STATUS: 'Trạng thái buổi diễn hiện tại chưa cho phép mở bán.',
};

export function PublicationPanel({
  id, updatedAt, onPublished,
}: { id: string; updatedAt: string; onPublished: () => void }) {
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
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Không thể tải trạng thái mở bán.');
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
      setError(failure instanceof Error ? failure.message : 'Không thể mở bán.');
      refresh();
    } finally {
      setPublishing(false);
    }
  }

  return (
    <section className="admin-data-panel organization-panel" aria-labelledby="sale-publication">
      <h2 id="sale-publication">Mở bán</h2>
      <div className="organization-form">
        <Link className="admin-secondary-action" to={`/organizer/concerts/${id}/preview`}>Xem trước</Link>
        {state?.status === 'DRAFT' ? (
          <button className="admin-primary-action" type="button" onClick={() => void publish()}
            disabled={publishing || !!error || state.issues.length > 0}>
            {publishing ? 'Đang mở bán…' : 'Xác nhận mở bán'}
          </button>
        ) : null}
      </div>
      {error ? <p role="alert">{error} <button type="button" className="admin-secondary-action" onClick={refresh}>Kiểm tra lại</button></p> : null}
      {!state && !error ? <p role="status">Đang kiểm tra điều kiện mở bán…</p> : null}
      {state ? (
        <>
          {state.issues.length > 0 ? <ul>{state.issues.map((issue) => <li key={issue}>{issueText[issue] ?? issue}</li>)}</ul> : null}
          <p role="status">Ticketing {state.versions.ticketingVersion >= target ? 'đã đồng bộ' : 'đang đồng bộ'} · Check-in {state.versions.checkinVersion >= target ? 'đã đồng bộ' : 'đang đồng bộ'}</p>
          {state.status === 'ON_SALE' ? <p>{state.versions.ticketingVersion >= target
            ? 'Buổi diễn đã được công khai theo lịch bán.'
            : 'Đã lưu yêu cầu. Buổi diễn sẽ được công khai khi Ticketing xác nhận.'}</p> : null}
        </>
      ) : null}
      <p>Để hoãn hoặc hủy buổi diễn, liên hệ bộ phận vận hành TicketBox.</p>
    </section>
  );
}
