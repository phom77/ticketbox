import { apiCommand, apiGet, apiMultipartCommand, type ApiCommandResult } from './client';

/** The organization profile kept by Identity (ADR 0007). Empty text fields are absent. */
export type OrganizationProfile = {
  organizationId: string;
  displayName: string;
  logoUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  legalName?: string;
  taxCode?: string;
  billingAddress?: string;
  reportingTimezone: string;
  version: number;
  canEditProfile: boolean;
  canEditStatementDetails: boolean;
};

export type ContactChanges = {
  contactEmail: string;
  contactPhone: string;
  website: string;
  reportingTimezone: string;
};

export type StatementDetailChanges = {
  legalName: string;
  taxCode: string;
  billingAddress: string;
};

const base = (id: string) => `/api/organizations/${encodeURIComponent(id)}/profile`;

export function getOrganizationProfile(id: string, signal?: AbortSignal) {
  return apiGet<OrganizationProfile>(base(id), signal);
}

export function updateOrganizationProfile(id: string, changes: ContactChanges, version: number) {
  return apiCommand<OrganizationProfile>('PUT', base(id), { ...changes, version });
}

export function updateStatementDetails(
  id: string,
  changes: StatementDetailChanges,
  version: number,
) {
  return apiCommand<OrganizationProfile>('PUT', `${base(id)}/statement-details`, {
    ...changes,
    version,
  });
}

export function uploadOrganizationLogo(
  id: string,
  file: File,
  version: number,
): Promise<ApiCommandResult<OrganizationProfile>> {
  const form = new FormData();
  form.append('file', file);
  form.append('version', String(version));
  return apiMultipartCommand<OrganizationProfile>('PUT', `${base(id)}/logo`, form);
}

export function removeOrganizationLogo(id: string, version: number) {
  return apiCommand<OrganizationProfile>('DELETE', `${base(id)}/logo?version=${version}`);
}

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_MIN_SIDE = 128;
export const LOGO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
