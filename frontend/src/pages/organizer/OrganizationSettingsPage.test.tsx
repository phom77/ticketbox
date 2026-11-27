import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../../api/client';
import type { OrganizationProfile } from '../../api/organizationProfile';
import { OrganizationSettingsPage } from './OrganizationSettingsPage';

const api = vi.hoisted(() => ({
  getOrganizationProfile: vi.fn(),
  updateOrganizationProfile: vi.fn(),
  updateStatementDetails: vi.fn(),
  uploadOrganizationLogo: vi.fn(),
  removeOrganizationLogo: vi.fn(),
}));
vi.mock('../../api/organizationProfile', async (original) => ({
  ...(await original<typeof import('../../api/organizationProfile')>()),
  ...api,
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('../../components/feedback/toast-context', () => ({ useToast: () => toast }));
vi.mock('../../features/organizations/OrganizationProvider', () => ({
  useOrganization: () => ({ selected: { id: 'org-1', name: 'Dawn', grants: ['MEMBERS'] } }),
}));

const profile = (changes: Partial<OrganizationProfile> = {}): OrganizationProfile => ({
  organizationId: 'org-1',
  displayName: 'Dawn Live',
  reportingTimezone: 'Asia/Ho_Chi_Minh',
  version: 1,
  canEditProfile: true,
  canEditStatementDetails: true,
  contactEmail: 'desk@example.test',
  ...changes,
});

function open() {
  render(
    <MemoryRouter>
      <OrganizationSettingsPage />
    </MemoryRouter>,
  );
}

describe('OrganizationSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getOrganizationProfile.mockResolvedValue(profile());
  });

  it('lets a manager edit every section and shows the approved name read-only', async () => {
    open();
    expect(await screen.findByText('Dawn Live')).toBeVisible();
    expect(screen.queryByTestId('read-only-note')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save statement details' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save timezone' })).toBeEnabled();
    expect(screen.queryByRole('textbox', { name: 'Display name' })).toBeNull();
  });

  it('shows statement details as editable and the rest as read-only for a finance member', async () => {
    api.getOrganizationProfile.mockResolvedValue(profile({ canEditProfile: false }));
    open();
    await screen.findByText('Dawn Live');
    expect(screen.getAllByTestId('read-only-note')).toHaveLength(2);
    expect(screen.getByLabelText('Contact email')).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Save profile' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Choose a logo' })).toBeNull();
    expect(screen.getByLabelText('Legal name')).not.toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Save statement details' })).toBeEnabled();
  });

  it('is entirely read-only for a member without an editing grant', async () => {
    api.getOrganizationProfile.mockResolvedValue(
      profile({ canEditProfile: false, canEditStatementDetails: false }),
    );
    open();
    await screen.findByText('Dawn Live');
    expect(screen.getAllByTestId('read-only-note')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull();
  });

  it('saves with the current version and confirms with a toast', async () => {
    api.updateStatementDetails.mockResolvedValue({
      data: profile({ version: 2, legalName: 'Dawn Ltd' }),
    });
    open();
    fireEvent.change(await screen.findByLabelText('Legal name'), { target: { value: 'Dawn Ltd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save statement details' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Settings saved'));
    expect(api.updateStatementDetails).toHaveBeenCalledWith(
      'org-1',
      { legalName: 'Dawn Ltd', taxCode: '', billingAddress: '' },
      1,
    );
  });

  it('shows validation errors beside their fields', async () => {
    api.updateStatementDetails.mockRejectedValue(
      new ApiClientError('Invalid input', 400, { taxCode: 'Enter a tax code of 10 digits' }),
    );
    open();
    fireEvent.change(await screen.findByLabelText(/^Tax code/), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save statement details' }));
    expect(await screen.findByText('Enter a tax code of 10 digits')).toBeVisible();
    expect(screen.getByLabelText(/^Tax code/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('reloads the section and asks for a review after a conflict', async () => {
    api.updateOrganizationProfile.mockRejectedValue(new ApiClientError('conflict', 409));
    open();
    await screen.findByText('Dawn Live');
    api.getOrganizationProfile.mockResolvedValue(
      profile({ version: 5, contactEmail: 'new@example.test' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByText(/Someone else saved changes/)).toBeVisible();
    await waitFor(() =>
      expect(screen.getByLabelText('Contact email')).toHaveValue('new@example.test'),
    );
  });

  it('keeps unsaved edits in the other cards when one card conflicts', async () => {
    api.updateOrganizationProfile.mockRejectedValue(new ApiClientError('conflict', 409));
    open();
    fireEvent.change(await screen.findByLabelText('Legal name'), { target: { value: 'Typing…' } });
    api.getOrganizationProfile.mockResolvedValue(
      profile({ version: 5, contactEmail: 'new@example.test' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Contact email')).toHaveValue('new@example.test'),
    );
    expect(screen.getByLabelText('Legal name')).toHaveValue('Typing…');
  });
});
