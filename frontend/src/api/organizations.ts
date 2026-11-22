import { translate } from '../i18n';
import { api, apiGet } from './client';

export type OrganizationGrant = 'MEMBERS' | 'EVENTS' | 'FINANCE' | 'ADMISSION';

export const organizationGrantLabels: Record<OrganizationGrant, string> = {
  get ADMISSION() { return translate('performances:admissionGrant'); },
  get MEMBERS() { return translate("shared:organizations_quanLyThanhVien"); },
  get EVENTS() { return translate("shared:organizations_quanLyBuoiDien"); },
  get FINANCE() { return translate("shared:organizations_xemDonHangVaDoanhThu"); },
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
  email: string;
  fullName: string;
  role: string;
};

export type ApprovedOrganization = {
  id: string;
  name: string;
  initialManagerId: string;
};

export function getOrganizationMemberships(signal?: AbortSignal) {
  return apiGet<OrganizationMembership[]>('/api/organizations', signal);
}

export function getOrganizationMembers(id: string, signal?: AbortSignal) {
  return apiGet<OrganizationMember[]>(`/api/organizations/${id}/members`, signal);
}

export type InviteResult = { email: string; outcome: 'INVALID' | 'UNAVAILABLE' | 'MEMBER' | 'PENDING' | 'QUEUED' };
export type PendingOrganizerInvite = { id: string; email: string; expiresAt: string; delivered: boolean };
export type OrganizerApplication = {
  id: string; organizationName: string; managerName: string; email: string; firstEvent: string; organizationId: string | null;
  activationPending: boolean;
};

export function createOrganizationInvites(id: string, emails: string[], grants: OrganizationGrant[]) {
  return api.post<unknown, InviteResult[]>(`/api/organizations/${id}/invitations/email`, { emails, grants });
}

export function getPendingOrganizationInvites(id: string, signal?: AbortSignal) {
  return apiGet<PendingOrganizerInvite[]>(`/api/organizations/${id}/invitations/email`, signal);
}

export function resendOrganizationInvite(id: string, email: string) {
  return api.post(`/api/organizations/${id}/invitations/email/resend`, { email });
}

export function updateOrganizationMember(id: string, accountId: string, grants: OrganizationGrant[]) {
  return api.put(`/api/organizations/${id}/members/${accountId}`, { grants });
}

export function getApprovedOrganizations(signal?: AbortSignal) {
  return apiGet<ApprovedOrganization[]>('/api/admin/organizations', signal);
}

export function createPartnerLink() {
  return api.post<unknown, { token: string }>('/api/admin/organizations/applications/link');
}

export function getOrganizerApplications(signal?: AbortSignal) {
  return apiGet<OrganizerApplication[]>('/api/admin/organizations/applications', signal);
}

export function approveOrganizerApplication(id: string) {
  return api.post<unknown, { id: string }>(`/api/admin/organizations/applications/${id}/approve`);
}

export function resendOrganizerActivation(id: string) {
  return api.post(`/api/admin/organizations/applications/${id}/activation`);
}

export function getPlatformOrganizationMembers(id: string, signal?: AbortSignal) {
  return apiGet<OrganizationMember[]>(`/api/admin/organizations/${id}/members`, signal);
}

export function getPlatformOrganizationInvites(id: string, signal?: AbortSignal) {
  return apiGet<PendingOrganizerInvite[]>(`/api/admin/organizations/${id}/invitations/email`, signal);
}

export function migrateOrganizationMember(id: string, accountId: string, email: string) {
  return api.post<unknown, InviteResult>(`/api/admin/organizations/${id}/members/${accountId}/migration`, { email });
}

export function setOrganizationMemberActivity(id: string, accountId: string, active: boolean) {
  return api.put(`/api/admin/organizations/${id}/members/${accountId}/status`, { active });
}

export function recoverOrganizationManager(id: string, accountId: string) {
  return api.put(`/api/admin/organizations/${id}/manager`, { accountId });
}
