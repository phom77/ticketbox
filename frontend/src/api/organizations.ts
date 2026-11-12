import { api, apiGet } from './client';

export type OrganizationGrant = 'MEMBERS' | 'EVENTS' | 'FINANCE';

export const organizationGrantLabels: Record<OrganizationGrant, string> = {
  MEMBERS: 'Quản lý thành viên',
  EVENTS: 'Quản lý buổi diễn',
  FINANCE: 'Xem đơn hàng và doanh thu',
};

export type OrganizationMembership = {
  id: string;
  name: string;
  grants: OrganizationGrant[];
};

export type OrganizationMember = {
  accountId: string;
  grants: OrganizationGrant[];
  active: boolean;
};

export type ApprovedOrganization = {
  id: string;
  name: string;
  initialManagerId: string;
};

export function getOrganizationMemberships(signal?: AbortSignal) {
  return apiGet<OrganizationMembership[]>('/api/organizations', signal);
}

export function acceptOrganizationInvite(code: string) {
  return api.post<unknown, { id: string }>('/api/organizations/invitations/accept', { code });
}

export function getOrganizationMembers(id: string, signal?: AbortSignal) {
  return apiGet<OrganizationMember[]>(`/api/organizations/${id}/members`, signal);
}

export function createOrganizationInvite(id: string, accountId: string, grants: OrganizationGrant[]) {
  return api.post<unknown, { code: string; expiresAt: string }>(
    `/api/organizations/${id}/invitations`, { accountId, grants },
  );
}

export function updateOrganizationMember(id: string, accountId: string, grants: OrganizationGrant[]) {
  return api.put(`/api/organizations/${id}/members/${accountId}`, { grants });
}

export function getApprovedOrganizations(signal?: AbortSignal) {
  return apiGet<ApprovedOrganization[]>('/api/admin/organizations', signal);
}

export function approveOrganization(name: string, initialManagerId: string) {
  return api.post<unknown, { id: string }>('/api/admin/organizations', { name, initialManagerId });
}

export function recoverOrganizationManager(id: string, accountId: string) {
  return api.put(`/api/admin/organizations/${id}/manager`, { accountId });
}
