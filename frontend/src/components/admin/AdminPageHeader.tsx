import type { ReactNode } from 'react';

export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="admin-page-header">
      <div className="admin-page-header-copy">
        <h1>{title}</h1>
        {description ? <span>{description}</span> : null}
      </div>
      {actions ? <div className="admin-page-actions">{actions}</div> : null}
    </header>
  );
}
