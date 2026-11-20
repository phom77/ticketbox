import { getCheckinDataset, type StaffScope } from '../../api';
import { saveCheckinDataset } from '../../database';

export type DatasetDownloadSummary = {
  concertId: string;
  gate: string;
  totalCount: number;
  generatedAt: string;
  downloadedAt: string;
};

type DownloadCheckinDatasetInput = StaffScope & {
  accountId: string;
  concertId: string;
  gate: string;
};

export async function downloadCheckinDataset({
  accountId,
  concertId,
  gate,
  organizationId,
  token,
}: DownloadCheckinDatasetInput): Promise<DatasetDownloadSummary> {
  const selectedConcertId = concertId.trim();

  if (!selectedConcertId) {
    throw new Error('Missing event ID for ticket dataset');
  }

  const downloadedAt = new Date().toISOString();
  const dataset = await getCheckinDataset(selectedConcertId, { organizationId, token });

  if (dataset.concertId !== selectedConcertId) throw new Error('Ticket dataset has the wrong event');
  await saveCheckinDataset(accountId, dataset, downloadedAt);

  return {
    concertId: dataset.concertId,
    gate: gate.trim(),
    totalCount: dataset.totalCount,
    generatedAt: dataset.generatedAt,
    downloadedAt,
  };
}
