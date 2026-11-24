import { useTranslation } from 'react-i18next';
import { translate } from '../../../i18n';

export function SectionStatus({
  error,
  loading,
  retry,
}: {
  error: string;
  loading: boolean;
  retry: () => void;
}) {
  useTranslation();
  if (loading) return <p role="status">{translate('admin:concertWorkspacePage_dangTaiDuLieu')}</p>;
  if (!error) return null;
  return (
    <p role="alert">
      {error}{' '}
      <button type="button" className="admin-secondary-action" onClick={retry}>
        {translate('admin:concertWorkspacePage_thuLai')}
      </button>
    </p>
  );
}
