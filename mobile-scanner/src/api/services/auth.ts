import { ApiClientError, requestJson } from '../client';
import { deleteAccessToken, deleteStaffUser, saveAccessToken, saveStaffUser } from '../tokenStorage';
import type { AuthResponse } from '../types';

export async function loginStaff(email: string, password: string) {
  const response = await requestJson<AuthResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
  });

  if (response.user.role !== 'STAFF') {
    throw new ApiClientError('Only STAFF accounts can use the scanner app.', 403);
  }

  await saveAccessToken(response.accessToken);
  await saveStaffUser(response.user);

  return response;
}

export async function logoutStaff() {
  await deleteAccessToken();
  await deleteStaffUser();
}
