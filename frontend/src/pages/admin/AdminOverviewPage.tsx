import { ArrowUpRight, Bell, CalendarDays, Sparkles, Ticket, UserCog, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthContext';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';

const workspaces = [
  {
    to: '/admin/concerts',
    title: 'Buổi diễn',
    copy: 'Tạo chương trình, cập nhật thông tin và điều phối trạng thái bán.',
    icon: CalendarDays,
  },
  {
    to: '/admin/ticket-types',
    title: 'Hạng vé',
    copy: 'Quản lý giá, số lượng và màu vùng chỗ.',
    icon: Ticket,
  },
  {
    to: '/admin/guests',
    title: 'Khách mời',
    copy: 'Nhập danh sách CSV và theo dõi danh sách được duyệt.',
    icon: Users,
  },
  {
    to: '/admin/artist-bio',
    title: 'AI Artist Bio',
    copy: 'Tải hồ sơ báo chí PDF, rà soát giới thiệu do AI tạo và áp dụng vào concert.',
    icon: Sparkles,
  },
  {
    to: '/admin/notifications',
    title: 'Thông báo',
    copy: 'Theo dõi thông báo, thử gửi lại email lỗi và gửi nhắc lịch thủ công.',
    icon: Bell,
  },
  {
    to: '/admin/users',
    title: 'Người dùng',
    copy: 'Đổi vai trò, khóa hoặc mở tài khoản để kiểm thử ma trận RBAC.',
    icon: UserCog,
  },
];

export function AdminOverviewPage() {
  const { user } = useAuth();

  return (
    <>
      <AdminPageHeader
        eyebrow="Trung tâm điều phối"
        title={`Chào ${user?.fullName ?? 'bạn'}`}
        description="Điều phối chương trình, hạng vé và dữ liệu vận hành từ một không gian thống nhất."
        actions={
          <Link className="admin-primary-action" to="/admin/concerts?create=1">
            Tạo concert
            <ArrowUpRight aria-hidden="true" size={17} />
          </Link>
        }
      />

      <section className="admin-workspace-grid" aria-label="Khu vực quản lý">
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
