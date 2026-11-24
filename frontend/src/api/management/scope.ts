/** Admins manage every concert; organizers manage their selected organization's concerts. */
export type ManagementApiScope = 'admin' | 'organizer';

export function managementBase(scope: ManagementApiScope) {
  return scope === 'organizer' ? '/api/organizer/manage' : '/api/admin';
}
