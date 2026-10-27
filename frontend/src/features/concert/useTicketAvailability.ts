import { useCallback, useEffect, useRef, useState } from 'react';
import { isRequestCanceled } from '../../api/client';
import { getConcertTicketTypes, getTicketAvailability, type TicketType } from '../../api/concerts';

const AVAILABILITY_POLL_INTERVAL_MS = 1_500;

export function useTicketAvailability(concertId?: string, refreshKey = 0) {
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatesDelayed, setUpdatesDelayed] = useState(false);
  const [initialLoadFailed, setInitialLoadFailed] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const refreshRef = useRef<() => void>(() => undefined);
  const ticketTypeOrderRef = useRef<string[]>([]);

  const refresh = useCallback(() => {
    refreshRef.current();
  }, []);

  useEffect(() => {
    if (!concertId) {
      setTicketTypes([]);
      setLoading(false);
      return;
    }

    const activeConcertId = concertId;
    const controller = new AbortController();
    let active = true;
    let hasLoadedInventory = false;
    let requestInProgress = false;
    let timeoutId: number | undefined;
    let metadata: TicketType[] = [];
    let metadataUpdatedAt = 0;
    setLoading(true);
    setInitialLoadFailed(false);
    ticketTypeOrderRef.current = [];

    function scheduleNextRefresh() {
      window.clearTimeout(timeoutId);
      if (document.visibilityState === 'visible' && !controller.signal.aborted) {
        timeoutId = window.setTimeout(runRefresh, AVAILABILITY_POLL_INTERVAL_MS + Math.random() * 500);
      }
    }

    async function runRefresh() {
      if (requestInProgress || controller.signal.aborted) return;
      if (document.visibilityState === 'hidden') {
        scheduleNextRefresh();
        return;
      }

      requestInProgress = true;
      try {
        if (metadata.length === 0 || Date.now() - metadataUpdatedAt > 30_000) {
          metadata = await getConcertTicketTypes(activeConcertId, controller.signal);
          metadataUpdatedAt = Date.now();
        }
        const availability = await getTicketAvailability(activeConcertId, controller.signal);
        if (!active) return;
        const quantities = new Map(availability.items.map((item) => [item.ticketTypeId, item]));
        const activeTypes = metadata.filter((item) => item.isActive && quantities.has(item.id))
          .map((item) => ({ ...item, availableQty: quantities.get(item.id)!.availableQty,
            totalQuantity: quantities.get(item.id)!.totalQuantity }));
        if (ticketTypeOrderRef.current.length === 0) {
          ticketTypeOrderRef.current = activeTypes.map((item) => item.id);
        } else {
          const knownIds = new Set(ticketTypeOrderRef.current);
          ticketTypeOrderRef.current.push(
            ...activeTypes.filter((item) => !knownIds.has(item.id)).map((item) => item.id),
          );
        }
        const orderById = new Map(ticketTypeOrderRef.current.map((id, index) => [id, index]));
        setTicketTypes([...activeTypes].sort((left, right) => orderById.get(left.id)! - orderById.get(right.id)!));
        setLastUpdatedAt(new Date(availability.refreshedAt));
        setUpdatesDelayed(false);
        setInitialLoadFailed(false);
        hasLoadedInventory = true;
      } catch (requestError) {
        if (active && !isRequestCanceled(requestError)) {
          setUpdatesDelayed(true);
          if (!hasLoadedInventory) setInitialLoadFailed(true);
        }
      } finally {
        requestInProgress = false;
        if (active) {
          setLoading(false);
          scheduleNextRefresh();
        }
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        window.clearTimeout(timeoutId);
        void runRefresh();
      } else {
        window.clearTimeout(timeoutId);
      }
    }

    refreshRef.current = () => {
      window.clearTimeout(timeoutId);
      void runRefresh();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    void runRefresh();

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      refreshRef.current = () => undefined;
    };
  }, [concertId, refreshKey]);

  return {
    ticketTypes,
    loading,
    updatesDelayed,
    initialLoadFailed,
    lastUpdatedAt,
    refresh,
  };
}
