import { useEffect, useState } from 'react';
import { ArrowUpRight, CalendarDays, MapPin, ScanLine } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getStaffConcerts, type StaffConcert } from '../../api/admin';
import { isRequestCanceled } from '../../api/client';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { staffDateTime } from './staffPageUtils';

export function StaffOverviewPage() {
  const [concerts, setConcerts] = useState<StaffConcert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const data = await getStaffConcerts('ON_SALE', controller.signal);
        setConcerts(data.content);
      } catch (requestError) {
        if (!isRequestCanceled(requestError)) {
          setError(
            requestError instanceof Error ? requestError.message : 'Không thể tải ca làm việc.',
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  return (
    <>
      <AdminPageHeader
        eyebrow="Vận hành cổng"
        title="Ca làm việc"
        description="Chọn concert đang mở bán để chuẩn bị check-in, tra khách mời và theo dõi lịch sử vào cổng."
        actions={
          <Link className="admin-primary-action" to="/staff/check-in">
            <ScanLine aria-hidden="true" size={17} />
            Mở check-in QR
          </Link>
        }
      />
      {error ? (
        <div className="admin-notice error" role="alert">
          {error}
        </div>
      ) : null}
      <section className="staff-concert-list" aria-label="Concert dành cho nhân viên">
        {loading ? (
          <div className="admin-row-skeleton" aria-label="Đang tải concert" aria-live="polite">
            {[1, 2, 3].map((item) => (
              <span key={item} />
            ))}
          </div>
        ) : concerts.length ? (
          concerts.map((concert) => (
            <article key={concert.id} className="staff-concert-row">
              <div className="staff-concert-date">
                <CalendarDays size={18} />
                <strong>{staffDateTime.format(new Date(concert.eventDate))}</strong>
              </div>
              <div>
                <h2>{concert.title}</h2>
                <p>
                  <MapPin size={14} />
                  {concert.venueName}, {concert.venueAddress}
                </p>
              </div>
              <Link
                to={`/staff/check-in?concert=${concert.id}`}
                aria-label={`Mở check-in cho ${concert.title}`}
              >
                <ArrowUpRight size={18} />
              </Link>
            </article>
          ))
        ) : (
          <div className="admin-empty-state">
            <CalendarDays size={28} />
            <h2>Không có concert đang mở bán</h2>
            <p>
              Concert dành cho nhân viên sẽ xuất hiện tại đây khi backend trả về trạng thái ON_SALE.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
