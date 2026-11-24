import { Bell, UserCog } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';

export function AdminSettingsPage() {
  const { t } = useTranslation();
  return (
    <>
      <AdminPageHeader title={t('shared:operationsSettings')} />
      <nav className="admin-workspace-grid" aria-label={t('shared:operationsSettings')}>
        <Link className="admin-workspace-link" to="/admin/notifications">
          <Bell size={22} aria-hidden />
          {t('shared:operationsLayout_thongBao')}
        </Link>
        <Link className="admin-workspace-link" to="/admin/users">
          <UserCog size={22} aria-hidden />
          {t('shared:partnerInternalAccounts')}
        </Link>
      </nav>
    </>
  );
}
