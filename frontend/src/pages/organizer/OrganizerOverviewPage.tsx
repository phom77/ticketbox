import {
  ArrowUpRight,
  CalendarDays,
  CircleDollarSign,
  Sparkles,
  Ticket,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { useAuth } from '../../features/auth/AuthContext';

const workspaces = [
  {
    to: '/organizer/concerts',
    title: 'Buổi diễn',
    copy: 'Tạo chương trình, cập nhật thông tin và điều phối trạng thái bán.',
    icon: CalendarDays,
  },
  {
    to: '/organizer/ticket-types',
    title: 'Hạng vé',
    copy: 'Quản lý giá, số lượng và màu vùng chỗ.',
    icon: Ticket,
  },
  {
    to: '/organizer/guests',
    title: 'Khách mời',
    copy: 'Đưa danh sách CSV vào lịch import và theo dõi kết quả xử lý.',
    icon: Users,
  },
  {
    to: '/organizer/artist-bio',
    title: 'AI Artist Bio',
    copy: 'Tải hồ sơ báo chí PDF, rà soát nội dung AI và áp dụng vào concert.',
    icon: Sparkles,
  },
  {
    to: '/organizer/revenue',
    title: 'Doanh thu',
    copy: 'Theo dõi doanh thu, lượng vé bán và hiệu suất từng hạng vé.',
    icon: CircleDollarSign,
  },
];

export function OrganizerOverviewPage() {
  const { user } = useAuth();

  return (
    <>
      <AdminPageHeader
        eyebrow="Không gian nhà tổ chức"
        title={`Chào ${user?.fullName ?? 'bạn'}`}
        description="Quản lý concert, hạng vé và nội dung nghệ sĩ trong phạm vi chương trình do bạn sở hữu."
        actions={
          <Link className="admin-primary-action" to="/organizer/concerts?create=1">
            Tạo concert
            <ArrowUpRight aria-hidden="true" size={17} />
          </Link>
        }
      />

      <section className="admin-workspace-grid" aria-label="Khu vực quản lý của nhà tổ chức">
        {workspaces.map((workspace) => {
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
    </>
  );
}
