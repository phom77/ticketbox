import { useCallback, useEffect, useState } from 'react';
import {
  composeArtistBioDraft,
  getArtistBioJobs,
  publishConcertArtistBio,
  submitArtistBioJob,
  type ArtistBioJob,
  type ManagementApiScope,
} from '../../../api/admin';
import { useToast } from '../../../components/feedback/toast-context';
import { translate } from '../../../i18n';
import { useWorkspaceSection } from './useWorkspaceSection';

/**
 * Artist biography sources, AI drafts and publication for one concert. The draft lives with the
 * workspace so edits survive switching tabs; the workspace resets it when the concert reloads.
 */
export function useConcertArtistBio({
  id,
  apiScope,
  enabled,
  showEditResult,
  reload,
}: {
  id: string | undefined;
  apiScope: ManagementApiScope;
  enabled: boolean;
  showEditResult: (concertId: string, savedMessage: string) => Promise<boolean>;
  reload: () => Promise<void>;
}) {
  const toast = useToast();
  const [artistJobs, setArtistJobs] = useState<ArtistBioJob[]>([]);
  const [selectedArtistSourceIds, setSelectedArtistSourceIds] = useState<string[]>([]);
  const [combiningArtistSources, setCombiningArtistSources] = useState(false);
  const [artistBioDraft, setArtistBioDraft] = useState('');
  const [publishingArtistBio, setPublishingArtistBio] = useState(false);
  const [uploadingArtistSources, setUploadingArtistSources] = useState(false);

  const artistSection = useWorkspaceSection(
    !!id && enabled,
    useCallback(
      (signal: AbortSignal) =>
        getArtistBioJobs({ concertId: id, page: 0, size: 5 }, signal, apiScope),
      [id, apiScope],
    ),
  );
  useEffect(() => {
    if (artistSection.data) setArtistJobs(artistSection.data.content);
  }, [artistSection.data]);

  async function uploadArtistSources(files: File[]) {
    if (!id || !files.length) return;
    setUploadingArtistSources(true);
    try {
      for (const file of Array.from(files)) {
        await submitArtistBioJob(id, file, apiScope);
      }
      const refreshed = await getArtistBioJobs(
        { concertId: id, page: 0, size: 10 },
        undefined,
        apiScope,
      );
      setArtistJobs(refreshed.content);
      toast.success(
        translate('admin:concertWorkspacePage_taiLieuDaDuocGuiDeTao', { arg1: files.length }),
      );
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : translate('admin:concertWorkspacePage_khongTheGuiTaiLieuNguonCho'),
      );
    } finally {
      setUploadingArtistSources(false);
    }
  }

  async function publishArtistBio() {
    if (!id || !artistBioDraft.trim()) return;
    setPublishingArtistBio(true);
    try {
      await publishConcertArtistBio(id, artistBioDraft.trim(), apiScope);
      if (!(await showEditResult(id, 'admin:concertWorkspacePage_daXuatBanNoiDungNgheSi'))) {
        await reload();
      }
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : translate('admin:concertWorkspacePage_khongTheXuatBanNoiDungNghe'),
      );
    } finally {
      setPublishingArtistBio(false);
    }
  }

  function toggleArtistSource(jobId: string) {
    setSelectedArtistSourceIds((current) =>
      current.includes(jobId) ? current.filter((id) => id !== jobId) : [...current, jobId],
    );
  }

  async function combineArtistSources() {
    if (!id || selectedArtistSourceIds.length < 2) return;
    setCombiningArtistSources(true);
    try {
      const result = await composeArtistBioDraft(id, selectedArtistSourceIds, apiScope);
      setArtistBioDraft(result.data.resultBio ?? '');
      setArtistJobs((current) => [result.data, ...current]);
      setSelectedArtistSourceIds([]);
      toast.success(translate('admin:concertWorkspacePage_daTongHopCacNguonDaChon'));
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : translate('admin:concertWorkspacePage_khongTheTongHopCacTaiLieu'),
      );
    } finally {
      setCombiningArtistSources(false);
    }
  }

  return {
    artistSection,
    artistJobs,
    selectedArtistSourceIds,
    toggleArtistSource,
    combiningArtistSources,
    combineArtistSources,
    artistBioDraft,
    setArtistBioDraft,
    publishingArtistBio,
    publishArtistBio,
    uploadingArtistSources,
    uploadArtistSources,
  };
}
