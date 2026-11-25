import { type FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  createConcert,
  getConcertCategory,
  removeConcertPoster,
  setConcertCategory,
  updateConcert,
  uploadConcertPoster,
  type ManagementApiScope,
} from '../../../api/admin';
import type { ConcertDetail } from '../../../api/concerts';
import { getApprovedOrganizations, type ApprovedOrganization } from '../../../api/organizations';
import { useToast } from '../../../components/feedback/toast-context';
import { translate } from '../../../i18n';
import { emptyForm, formFromConcert, toPayload, type ConcertFormState } from './concertForm';

/**
 * The create and edit dialog: form state, owner choice for admins, poster changes and saving.
 * `?create=1` (with an optional `organizationId` for admins) opens it for a new concert.
 */
export function useConcertEditor({
  apiScope,
  loadConcerts,
}: {
  apiScope: ManagementApiScope;
  loadConcerts: () => Promise<void>;
}) {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editing, setEditing] = useState<ConcertDetail | null>(null);
  const creatingFromLink = searchParams.get('create') === '1';
  const requestedOwner =
    creatingFromLink && apiScope === 'admin' ? (searchParams.get('organizationId') ?? '') : '';
  const [formOpen, setFormOpen] = useState(creatingFromLink);
  const [form, setForm] = useState<ConcertFormState>(emptyForm);
  const [organizations, setOrganizations] = useState<ApprovedOrganization[]>([]);
  const [owner, setOwner] = useState(requestedOwner);
  const [organizationsError, setOrganizationsError] = useState('');
  const [posterFile, setPosterFile] = useState<File | null>(null);
  // The category the dialog opened with; the category is only written when it differs.
  const [savedCategory, setSavedCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [removingPoster, setRemovingPoster] = useState(false);

  useEffect(() => {
    if (apiScope !== 'admin' || !formOpen || editing) return;
    const controller = new AbortController();
    void getApprovedOrganizations(controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) {
          setOrganizations(items);
          setOrganizationsError('');
        }
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setOrganizationsError(
            failure instanceof Error
              ? failure.message
              : translate('admin:adminOrganizationsPage_khongTheTaiDanhSachToChuc'),
          );
      });
    return () => controller.abort();
  }, [apiScope, editing, formOpen]);

  useEffect(() => {
    if (creatingFromLink) {
      setEditing(null);
      setForm(emptyForm);
      setOwner(requestedOwner);
      setFormOpen(true);
    }
  }, [creatingFromLink, requestedOwner]);

  const ownerName = owner
    ? organizations.find((organization) => organization.id === owner)?.name
    : 'TicketBox';
  const canSaveOwner = apiScope !== 'admin' || Boolean(editing || ownerName);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setSavedCategory('');
    setPosterFile(null);
    setOwner('');
    setFormOpen(true);
  }

  function openEdit(concert: ConcertDetail) {
    setEditing(concert);
    setForm(formFromConcert(concert));
    setSavedCategory('');
    setPosterFile(null);
    setFormOpen(true);
    void getConcertCategory(concert.id, undefined, apiScope)
      .then((result) => {
        const category = result.category ?? '';
        setSavedCategory(category);
        setForm((current) => (current.category ? current : { ...current, category }));
      })
      .catch(() => undefined);
  }

  function closeForm() {
    setFormOpen(false);
    setPosterFile(null);
    setSearchParams({}, { replace: true });
  }

  async function submitForm(event: FormEvent) {
    event.preventDefault();
    if (!canSaveOwner) return;
    setSaving(true);
    try {
      const payload = toPayload(form);
      const result = editing
        ? await updateConcert(editing.id, payload, apiScope)
        : await createConcert(payload, apiScope, owner);

      if (form.category !== savedCategory) {
        try {
          await setConcertCategory(result.data.id, form.category || null, apiScope);
        } catch (categoryError) {
          closeForm();
          await loadConcerts();
          toast.error(
            categoryError instanceof Error
              ? categoryError.message
              : translate('admin:adminConcertsPage_khongTheLuuConcert'),
          );
          return;
        }
      }

      if (posterFile) {
        try {
          await uploadConcertPoster(result.data.id, posterFile, apiScope);
        } catch (uploadError) {
          closeForm();
          await loadConcerts();
          toast.error(
            uploadError instanceof Error
              ? translate('admin:adminConcertsPage_concertDaDuocLuuNhungPosterChua', {
                  arg1: uploadError.message,
                })
              : translate('admin:adminConcertsPage_concertDaDuocLuuNhungPosterChua_2'),
          );
          return;
        }
      }

      toast.success(
        editing
          ? translate('admin:adminConcertsPage_daCapNhatConcert')
          : apiScope === 'admin'
            ? translate('concert-directory:createdFor', { organization: ownerName })
            : translate('admin:adminConcertsPage_daTaoConcertOTrangThaiBan'),
      );
      closeForm();
      await loadConcerts();
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : translate('admin:adminConcertsPage_khongTheLuuConcert'),
      );
    } finally {
      setSaving(false);
    }
  }

  function choosePoster(file: File | null) {
    if (!file) {
      setPosterFile(null);
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error(translate('admin:adminConcertsPage_posterPhaiLaAnhJpegPngHoac'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(translate('admin:adminConcertsPage_posterKhongDuocVuotQua5Mb'));
      return;
    }
    setPosterFile(file);
  }

  async function removePoster() {
    if (!editing?.posterUrl) return;
    setRemovingPoster(true);
    try {
      const result = await removeConcertPoster(editing.id, apiScope);
      setEditing(result.data);
      toast.success(result.message || translate('admin:adminConcertsPage_daXoaPosterConcert'));
      await loadConcerts();
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : translate('admin:adminConcertsPage_khongTheXoaPosterConcert'),
      );
    } finally {
      setRemovingPoster(false);
    }
  }

  return {
    editing,
    formOpen,
    form,
    setForm,
    organizations,
    owner,
    setOwner,
    organizationsError,
    posterFile,
    saving,
    removingPoster,
    canSaveOwner,
    openCreate,
    openEdit,
    closeForm,
    submitForm,
    choosePoster,
    removePoster,
  };
}
