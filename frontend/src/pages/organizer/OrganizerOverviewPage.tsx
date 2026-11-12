import { type FormEvent, useState } from 'react';
import { acceptOrganizationInvite, type OrganizationGrant } from '../../api/organizations';
import { useOrganization } from '../../features/organizations/OrganizationProvider';
import {
  ArrowUpRight,
  CalendarDays,
  CircleDollarSign,
  Ticket,
  Users,
  UserCog,
  Receipt,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { useAuth } from '../../features/auth/AuthContext';

const workspaces: {
  to: string;
  title: string;
  copy: string;
  icon: typeof CalendarDays;
  grant: OrganizationGrant;
}[] = [
  {
    to: '/organizer/concerts',
    grant: 'EVENTS',
    title: 'Buổi diễn',
    copy: 'Tạo chương trình, cập nhật thông tin và điều phối trạng thái bán.',
    icon: CalendarDays,
  },
  {
    to: '/organizer/ticket-types',
    grant: 'EVENTS',
    title: 'Hạng vé',
    copy: 'Quản lý giá, số lượng và màu vùng chỗ.',
    icon: Ticket,
  },
  {
    to: '/organizer/guests',
    grant: 'EVENTS',
    title: 'Khách mời',
    copy: 'Đưa danh sách CSV vào lịch import và theo dõi kết quả xử lý.',
    icon: Users,
  },
  {
    to: '/organizer/revenue',
    grant: 'FINANCE',
    title: 'Doanh thu',
    copy: 'Theo dõi doanh thu, lượng vé bán và hiệu suất từng hạng vé.',
    icon: CircleDollarSign,
  },
  {
    to: '/organizer/orders', grant: 'FINANCE', title: 'Đơn hàng và vé',
    copy: 'Tra cứu giao dịch và vé của tổ chức.', icon: Receipt,
  },
  {
    to: '/organizer/members', grant: 'MEMBERS', title: 'Thành viên',
    copy: 'Mời thành viên và cập nhật quyền.', icon: UserCog,
  },
];

export function OrganizerOverviewPage() {
  const { user } = useAuth();
  const organization = useOrganization();
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const selected = organization?.selected;

  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (joining || !organization) return;
    setJoining(true);
    setError('');
    setNotice('');
    try {
      const { id } = await acceptOrganizationInvite(code.trim());
      setCode('');
      await organization.reload(id);
      setNotice('Đã tham gia tổ chức.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Không thể nhận lời mời.');
    } finally {
      setJoining(false);
    }
  }

  return (
    <>
      <AdminPageHeader
        title={selected?.name ?? 'Tổ chức của bạn'}
        description="Chọn tổ chức để mở các mục bạn được cấp quyền."
        actions={selected?.grants.includes('EVENTS') ? (
          <Link className="admin-primary-action" to="/organizer/concerts?create=1">
            Tạo concert
            <ArrowUpRight aria-hidden="true" size={17} />
          </Link>
        ) : null}
      />

      {organization?.loading ? <p role="status">Đang tải tổ chức…</p> : null}
      {organization?.error ? (
        <div className="admin-notice error" role="alert">
          <p>{organization.error}</p>
          <button className="admin-secondary-action" type="button" onClick={() => void organization.reload()}>Thử lại</button>
        </div>
      ) : null}
      {selected ? (
        <section className="admin-workspace-grid" aria-label="Khu vực quản lý của nhà tổ chức">
        {workspaces.filter((workspace) => selected.grants.includes(workspace.grant)).map((workspace) => {
          const Icon = workspace.icon;
          return (
            <Link key={workspace.to} to={workspace.to} className="admin-workspace-link">
              <Icon aria-hidden="true" size={22} strokeWidth={1.7} />
              <div>
                <h2>{workspace.title}</h2>
                <p>{workspace.copy}</p>
              </div>
              <ArrowUpRight aria-hidden="true" size={18} />
            </Link>
          );
        })}
        </section>
      ) : null}
      <section className="admin-data-panel organization-panel">
        <h2>Nhận lời mời</h2>
        <p>Chia sẻ mã tài khoản này với người quản lý để được mời.</p>
        <code>{user?.id}</code>
        {notice ? <p className="admin-notice success" role="status">{notice}</p> : null}
        {error ? <p className="admin-notice error" role="alert">{error}</p> : null}
        <form className="organization-form" onSubmit={(event) => void accept(event)}>
          <label className="admin-field">
            Mã lời mời
            <input value={code} onChange={(event) => setCode(event.target.value)} required minLength={36} maxLength={36} />
          </label>
          <button className="admin-primary-action" type="submit" disabled={joining}>Tham gia tổ chức</button>
        </form>
      </section>
    </>
  );
}
