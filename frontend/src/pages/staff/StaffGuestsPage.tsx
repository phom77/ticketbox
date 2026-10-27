import { type FormEvent, useEffect, useState } from 'react';
import { RefreshCw, Search, UserCheck, Users } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import {
  getStaffConcerts,
  lookupStaffGuest,
  checkInStaffGuest,
  type StaffConcert,
  type StaffGuestLookup,
} from '../../api/admin';
import { isRequestCanceled } from '../../api/client';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { ConcertPicker } from '../../components/admin/ConcertPicker';
import { selectInitialConcert } from './staffPageUtils';

export function StaffGuestsPage() {
  const [searchParams] = useSearchParams();
  const [concerts, setConcerts] = useState<StaffConcert[]>([]);
  const [selectedConcertId, setSelectedConcertId] = useState('');
  const [loadingConcerts, setLoadingConcerts] = useState(true);
  const [phone, setPhone] = useState('');
  const [lookupResult, setLookupResult] = useState<StaffGuestLookup | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [gate, setGate] = useState('VIP');

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

  async function submitLookup(event: FormEvent) {
    event.preventDefault();
    if (!selectedConcertId || !phone.trim()) return;
    setLookupLoading(true);
    setLookupResult(null);
    setError('');
    try {
      setLookupResult(await lookupStaffGuest(selectedConcertId, phone.trim()));
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Không thể tra cứu khách mời.',
      );
    } finally {
      setLookupLoading(false);
    }
  }

  async function checkInGuest() {
    if (!lookupResult?.guestId || !selectedConcertId || lookupResult.checkedInAt) return;
    setCheckinLoading(true);
    setError('');
    try {
      const response = await checkInStaffGuest(
        lookupResult.guestId,
        selectedConcertId,
        gate.trim() || 'VIP',
      );
      setLookupResult(response.data);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Không thể check-in khách mời.',
      );
    } finally {
      setCheckinLoading(false);
    }
  }

  return (
    <>
      <AdminPageHeader
        eyebrow="Bàn khách mời"
        title="Tra cứu khách mời"
        description="Xác minh khách mời tại cổng theo concert và số điện thoại. Danh sách import đầy đủ nằm trong không gian admin/nhà tổ chức."
      />

      {error ? (
        <div className="admin-notice error" role="alert">
          {error}
        </div>
      ) : null}

      <section className="staff-desk-grid">
        <form className="staff-panel" onSubmit={(event) => void submitLookup(event)}>
          <div className="guest-section-heading">
            <div>
              <span>Tra cứu</span>
              <h2>Kiểm tra tại cổng</h2>
            </div>
            <UserCheck aria-hidden="true" size={22} />
          </div>

          <ConcertPicker
            concerts={concerts}
            value={selectedConcertId}
            label="Concert tại cổng"
            placeholder={loadingConcerts ? 'Đang tải concert...' : 'Không có concert đang bán'}
            disabled={loadingConcerts || !concerts.length}
            onChange={(id) => {
              setSelectedConcertId(id);
              setLookupResult(null);
            }}
          />

          <label className="admin-field">
            Số điện thoại
            <input
              inputMode="tel"
              placeholder="VD: 0901234567"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>

          <button
            className="admin-primary-action"
            disabled={!selectedConcertId || !phone.trim() || lookupLoading}
            type="submit"
          >
            {lookupLoading ? (
              <RefreshCw aria-hidden="true" size={16} />
            ) : (
              <Search aria-hidden="true" size={16} />
            )}
            {lookupLoading ? 'Đang tra cứu' : 'Tra cứu khách'}
          </button>
        </form>

        <div className="staff-panel">
          <div className="guest-section-heading">
            <div>
              <span>Kết quả</span>
              <h2>Kết quả</h2>
            </div>
            <Users aria-hidden="true" size={22} />
          </div>

          {lookupResult ? (
            lookupResult.found ? (
              <GuestCard
                guest={lookupResult}
                featured
                gate={gate}
                checkinLoading={checkinLoading}
                onGateChange={setGate}
                onCheckIn={() => void checkInGuest()}
              />
            ) : (
              <div className="admin-empty-state staff-empty-compact">
                <Search aria-hidden="true" size={28} />
                <h2>Không tìm thấy khách</h2>
                <p>
                  Số điện thoại này không nằm trong danh sách khách đang kích hoạt của concert đã
                  chọn.
                </p>
              </div>
            )
          ) : (
            <div className="admin-empty-state staff-empty-compact">
              <UserCheck aria-hidden="true" size={28} />
              <h2>Sẵn sàng tra cứu</h2>
              <p>Nhập số điện thoại của khách mời để xác nhận thông tin trước khi cho vào cổng.</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function GuestCard({
  guest,
  featured = false,
  gate,
  checkinLoading,
  onGateChange,
  onCheckIn,
}: {
  guest: StaffGuestLookup;
  featured?: boolean;
  gate: string;
  checkinLoading: boolean;
  onGateChange: (value: string) => void;
  onCheckIn: () => void;
}) {
  return (
    <article className={`staff-guest-card ${featured ? 'featured' : ''}`}>
      <div>
        <strong>{guest.fullName ?? 'Khách mời'}</strong>
        <span>{guest.phone ?? 'Chưa có số điện thoại'}</span>
      </div>
      <dl>
        <div>
          <dt>Hạng</dt>
          <dd>{guest.category ?? 'Chưa phân loại'}</dd>
        </div>
        <div>
          <dt>Đơn vị mời</dt>
          <dd>{guest.sponsorName ?? 'Không có'}</dd>
        </div>
        <div>
          <dt>Ghi chú</dt>
          <dd>{guest.notes ?? 'Không có ghi chú'}</dd>
        </div>
        <div>
          <dt>Trạng thái</dt>
          <dd>
            {guest.checkedInAt
              ? `Đã check-in lúc ${new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(guest.checkedInAt))}`
              : 'Chưa check-in'}
          </dd>
        </div>
      </dl>
      {guest.checkedInAt ? (
        <div className="staff-guest-checked">
          <UserCheck size={17} /> Đã xác nhận tại cổng {guest.checkinGate ?? 'VIP'}
        </div>
      ) : (
        <div className="staff-guest-checkin-actions">
          <label>
            <span>Cổng vào</span>
            <input
              value={gate}
              maxLength={100}
              onChange={(event) => onGateChange(event.target.value)}
            />
          </label>
          <button
            className="admin-primary-action"
            type="button"
            disabled={checkinLoading}
            onClick={onCheckIn}
          >
            <UserCheck size={16} />
            {checkinLoading ? 'Đang xác nhận...' : 'Xác nhận vào cổng'}
          </button>
        </div>
      )}
    </article>
  );
}
