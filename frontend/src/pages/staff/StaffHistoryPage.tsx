import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, FileClock, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import {
  getStaffCheckinHistory,
  getStaffConcerts,
  type StaffCheckinHistory,
  type StaffConcert,
} from '../../api/admin';
import type { Page } from '../../api/concerts';
import { isRequestCanceled } from '../../api/client';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { selectInitialConcert, staffConcertLabel, staffDateTime } from './staffPageUtils';

export function StaffHistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [concerts, setConcerts] = useState<StaffConcert[]>([]);
  const [selectedConcertId, setSelectedConcertId] = useState('');
  const [loadingConcerts, setLoadingConcerts] = useState(true);
  const [history, setHistory] = useState<Page<StaffCheckinHistory> | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState('');
  const page = Math.max(0, Math.floor(Number(searchParams.get('page')) || 0));

  useEffect(() => {
    const controller = new AbortController();
    async function loadConcerts() {
      setLoadingConcerts(true);
      setError('');
      try {
        const data = await getStaffConcerts('ON_SALE', controller.signal);
        setConcerts(data.content);
        setSelectedConcertId(
          (current) => current || selectInitialConcert(data.content, searchParams.get('concert')),
        );
      } catch (requestError) {
        if (!isRequestCanceled(requestError)) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Không thể tải danh sách concert.',
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoadingConcerts(false);
      }
    }
    void loadConcerts();
    return () => controller.abort();
  }, [searchParams]);

  const loadHistory = useCallback(
    async (signal?: AbortSignal, silent = false) => {
      if (!selectedConcertId) {
        setHistory(null);
        setLoadingHistory(false);
        return;
      }
      if (!silent) setLoadingHistory(true);
      setError('');
      try {
        setHistory(await getStaffCheckinHistory(selectedConcertId, page, 20, signal));
      } catch (requestError) {
        if (!isRequestCanceled(requestError)) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Không thể tải lịch sử check-in.',
          );
        }
      } finally {
        if (!signal?.aborted && !silent) setLoadingHistory(false);
      }
    },
    [page, selectedConcertId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadHistory(controller.signal);
    return () => controller.abort();
  }, [loadHistory]);

  function changePage(nextPage: number) {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(nextPage));
    if (selectedConcertId) params.set('concert', selectedConcertId);
    setSearchParams(params);
  }

  return (
    <>
      <AdminPageHeader
        eyebrow="Đối soát cổng"
        title="Lịch sử check-in"
        description="Theo dõi các lượt vào cổng theo concert, gồm lượt quét online từ web/mobile và các log offline đã đồng bộ lên máy chủ."
        actions={
          <button
            className="admin-secondary-action"
            disabled={loadingHistory}
            type="button"
            onClick={() => void loadHistory()}
          >
            <RefreshCw aria-hidden="true" size={17} />
            Làm mới
          </button>
        }
      />

      {error ? (
        <div className="admin-notice error" role="alert">
          {error}
        </div>
      ) : null}

      <section className="admin-concert-switcher">
        <label>
          Concert
          <select
            disabled={loadingConcerts || !concerts.length}
            value={selectedConcertId}
            onChange={(event) => {
              const nextConcertId = event.target.value;
              setSelectedConcertId(nextConcertId);
              const params = new URLSearchParams(searchParams);
              params.set('concert', nextConcertId);
              params.set('page', '0');
              setSearchParams(params);
            }}
          >
            {loadingConcerts ? <option>Đang tải concert...</option> : null}
            {!loadingConcerts && !concerts.length ? (
              <option>Không có concert đang bán</option>
            ) : null}
            {concerts.map((concert) => (
              <option key={concert.id} value={concert.id}>
                {staffConcertLabel(concert)}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span>Tổng log</span>
          <strong>{history?.totalElements ?? 0}</strong>
        </div>
      </section>

      <section className="admin-data-panel">
        {loadingHistory ? (
          <div
            className="admin-row-skeleton"
            aria-label="Đang tải lịch sử check-in"
            aria-live="polite"
          >
            {[1, 2, 3, 4].map((item) => (
              <span key={item} />
            ))}
          </div>
        ) : history?.content.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table staff-history-table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Vé</th>
                  <th>Nguồn</th>
                  <th>Cổng</th>
                  <th>Trạng thái vé</th>
                  <th>Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {history.content.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong className="admin-table-primary">
                        {staffDateTime.format(new Date(item.checkedAt))}
                      </strong>
                      <span className="admin-table-secondary">
                        {item.syncAt
                          ? `Đồng bộ ${staffDateTime.format(new Date(item.syncAt))}`
                          : 'Online thời gian thực'}
                      </span>
                    </td>
                    <td>
                      <strong className="admin-table-primary">{item.ticketId}</strong>
                      <span className="admin-table-secondary">{item.id.slice(0, 8)}</span>
                    </td>
                    <td>
                      <span
                        className={`admin-status ${item.offline ? 'status-sold_out' : 'status-on_sale'}`}
                      >
                        {item.offline ? 'Offline sync' : 'Online'}
                      </span>
                      <span className="admin-table-secondary">{item.deviceId}</span>
                    </td>
                    <td>
                      <strong className="admin-table-primary">{item.gate ?? 'Không rõ'}</strong>
                    </td>
                    <td>
                      <strong className="admin-table-primary">
                        {item.ticketStatus ?? 'Không rõ'}
                      </strong>
                    </td>
                    <td>
                      <span className="admin-table-secondary">{item.notes ?? 'Không có'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="admin-empty-state">
            <FileClock aria-hidden="true" size={28} />
            <h2>Chưa có log check-in</h2>
            <p>
              Các lượt check-in thành công sẽ xuất hiện tại đây sau khi nhân viên quét vé hoặc đồng
              bộ offline.
            </p>
          </div>
        )}
      </section>

      {history && history.totalPages > 1 ? (
        <div className="admin-pagination">
          <span>
            Trang {history.number + 1} / {history.totalPages}
          </span>
          <div>
            <button
              disabled={history.first}
              type="button"
              onClick={() => changePage(Math.max(0, history.number - 1))}
              aria-label="Trang trước"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              disabled={history.last}
              type="button"
              onClick={() => changePage(history.number + 1)}
              aria-label="Trang sau"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
