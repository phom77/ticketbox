import type { ManagementApiScope } from '../../api/admin';

export function reportReturnPath(target: string | null, scope: ManagementApiScope) {
  const path = `/${scope}/reports`;
  return target === path || target?.startsWith(path + '?') ? target : undefined;
}
