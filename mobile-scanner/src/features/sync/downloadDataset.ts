import { getCheckinDataset } from '../../api';
import { saveCheckinDataset } from '../../database';

export type DatasetDownloadSummary = {
  concertId: string;
  gate: string;
  totalCount: number;
  generatedAt: string;
  downloadedAt: string;
};

type DownloadCheckinDatasetInput = {
  concertId: string;
  gate: string;
  accessToken?: string;
};

export async function downloadCheckinDataset({
  concertId,
  gate,
  accessToken,
}: DownloadCheckinDatasetInput): Promise<DatasetDownloadSummary> {
  const selectedConcertId = concertId.trim();

  if (!selectedConcertId) {
    throw new Error('Chọn concert trước khi tải dataset.');
  }

  const downloadedAt = new Date().toISOString();
  const dataset = await getCheckinDataset(selectedConcertId, accessToken);

  await saveCheckinDataset(dataset, downloadedAt);

  return {
    concertId: dataset.concertId,
    gate: gate.trim(),
    totalCount: dataset.totalCount,
    generatedAt: dataset.generatedAt,
    downloadedAt,
  };
}
