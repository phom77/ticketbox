import { useCallback, useEffect, useState } from 'react';
import { translate } from '../../../i18n';

export type WorkspaceSection<T> = {
  data: T | null;
  error: string;
  loading: boolean;
  retry: () => void;
};

/** Loads one workspace section, with its own loading, error and retry state. */
export function useWorkspaceSection<T>(
  enabled: boolean,
  fetchSection: (signal: AbortSignal) => Promise<T>,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(enabled);
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setData(null);
    setError('');
    setLoading(true);
    void fetchSection(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : translate('admin:concertWorkspacePage_khongTaiDuocDuLieu'),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [enabled, fetchSection, revision]);

  return { data, error, loading, retry };
}
