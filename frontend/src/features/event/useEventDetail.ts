import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiClientError, isRequestCanceled } from '../../api/client';
import {
  getConcert,
  getConcertTicketTypes,
  type ConcertDetail,
  type TicketType,
} from '../../api/concerts';
import {
  getAvailability,
  getEvent,
  type Availability,
  type EventDetails,
} from '../../api/performances';
import { getConcertPreview } from '../../api/publication';
import { concertDescription, concertTitle } from '../concert/concertText';
import { useTicketAvailability } from '../concert/useTicketAvailability';
import type { DetailDate, EventDetailModel } from './eventDetail';

export type DetailSource = EventDetailModel & { inlineTypes: TicketType[] | null };

export function legacyModel(concert: ConcertDetail): DetailSource {
  return {
    eventId: null,
    title: concertTitle(concert),
    description: concertDescription(concert),
    artistBio: concert.artistBio,
    category: null,
    posterUrl: concert.posterUrl,
    organizer: concert.organizationName?.trim() || null,
    seatMapSvg: concert.seatMapSvg,
    inlineTypes: concert.ticketTypes?.length ? concert.ticketTypes : null,
    dates: [
      {
        id: concert.id,
        startsAt: concert.eventDate,
        endsAt: null,
        timezone: null,
        venueName: concert.venueName,
        venueAddress: concert.venueAddress || null,
        spaceName: null,
        doorsOpenAt: concert.doorsOpenAt,
        saleStartAt: concert.saleStartAt,
        saleEndAt: concert.saleEndAt,
        status: concert.status,
        salesSuspended: false,
        maxPerAccount: null,
        legacyConcertId: concert.id,
      },
    ],
  };
}

export function eventModel(event: EventDetails): DetailSource {
  return {
    eventId: event.id,
    title: event.title,
    description: event.description,
    artistBio: null,
    category: event.category ?? null,
    posterUrl: null,
    organizer: null,
    seatMapSvg: null,
    inlineTypes: null,
    dates: [...event.performances]
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
      .map((performance) => ({
        id: performance.id,
        startsAt: performance.startsAt,
        endsAt: performance.endsAt,
        timezone: performance.timezone,
        venueName: performance.venueName,
        venueAddress: performance.venueAddress ?? null,
        spaceName: performance.spaceName ?? null,
        doorsOpenAt: performance.doorsOpenAt ?? null,
        saleStartAt: performance.saleStartAt,
        saleEndAt: performance.saleEndAt,
        status: performance.status,
        salesSuspended: performance.salesSuspended,
        maxPerAccount: performance.maxPerAccount ?? null,
        legacyConcertId: performance.legacyConcertId,
      })),
  };
}

/** The Event + Performance model first; a legacy concert id that has no event falls back to the concert. */
export async function loadDetail(id: string, preview: boolean, signal: AbortSignal) {
  if (preview) return legacyModel(await getConcertPreview(id, signal));
  try {
    return eventModel(await getEvent(id, signal));
  } catch (error) {
    if (!(error instanceof ApiClientError) || error.status !== 404) throw error;
    return legacyModel(await getConcert(id, signal));
  }
}

export function useEventDetail(id: string, preview: boolean) {
  const [source, setSource] = useState<DetailSource | null>(null);
  const [error, setError] = useState<'unavailable' | 'temporary' | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    loadDetail(id, preview, controller.signal)
      .then((model) => {
        if (!controller.signal.aborted) setSource(model);
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted || isRequestCanceled(failure)) return;
        setError(
          failure instanceof ApiClientError && [403, 404].includes(failure.status)
            ? 'unavailable'
            : 'temporary',
        );
      });
    return () => controller.abort();
  }, [id, preview, reloadKey]);
  const retry = useCallback(() => {
    setError(null);
    setReloadKey((key) => key + 1);
  }, []);
  return { source, error, retry };
}

export type TicketRow = {
  id: string;
  name: string;
  group: string | null;
  price: number;
  available: number;
  color: string | null;
  maxPerAccount: number | null;
};

const typeRow = (type: TicketType): TicketRow => ({
  id: type.id,
  name: type.name,
  group: null,
  price: type.price,
  available: type.availableQty,
  color: type.zoneColor || null,
  maxPerAccount: type.maxPerAccount || null,
});

export function availabilityRows(availability: Availability): TicketRow[] {
  return availability.groups.flatMap((group) =>
    group.offers
      .filter((offer) => offer.active)
      .map((offer) => ({
        id: offer.id,
        name: offer.name,
        group: group.sectionLabel,
        price: offer.price,
        available: group.available,
        color: null,
        maxPerAccount: null,
      })),
  );
}

export const isSoldOut = (rows: TicketRow[]) =>
  rows.length > 0 && rows.every((row) => row.available <= 0);

const PERFORMANCE_POLL_MS = 5_000;

/** Live ticket rows of the selected date: legacy concerts and performances use their own availability API. */
export function useTicketRows(
  source: DetailSource | null,
  date: DetailDate | undefined,
  preview: boolean,
) {
  const legacyId = date?.legacyConcertId ?? undefined;
  const [refreshKey, setRefreshKey] = useState(0);
  const retry = useCallback(() => setRefreshKey((key) => key + 1), []);
  const live = useTicketAvailability(!preview && legacyId ? legacyId : undefined, refreshKey);
  const [perf, setPerf] = useState<{
    id: string;
    availability: Availability | null;
    failed: boolean;
  } | null>(null);
  const performanceId = !preview && date && !legacyId ? date.id : undefined;
  useEffect(() => {
    if (!performanceId) return;
    const controller = new AbortController();
    let timer: number | undefined;
    let inFlight = false;
    const poll = () => {
      if (inFlight) return;
      inFlight = true;
      getAvailability(performanceId, controller.signal)
        .then((availability) => {
          if (!controller.signal.aborted)
            setPerf({ id: performanceId, availability, failed: false });
        })
        .catch((failure: unknown) => {
          if (controller.signal.aborted || isRequestCanceled(failure)) return;
          setPerf((current) => ({
            id: performanceId,
            availability: current?.id === performanceId ? current.availability : null,
            failed: true,
          }));
        })
        .finally(() => {
          inFlight = false;
          if (!controller.signal.aborted && document.visibilityState === 'visible')
            timer = window.setTimeout(poll, PERFORMANCE_POLL_MS);
        });
    };
    poll();
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        window.clearTimeout(timer);
        poll();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [performanceId, refreshKey]);

  return useMemo(() => {
    if (preview)
      return {
        rows: (source?.inlineTypes ?? []).map(typeRow),
        loading: false,
        failed: false,
        soldOut: false,
        retry,
      };
    if (legacyId) {
      const rows = live.ticketTypes.filter((type) => type.isActive).map(typeRow);
      return {
        rows,
        loading: live.loading && !rows.length,
        failed: live.initialLoadFailed && !rows.length,
        soldOut: isSoldOut(rows),
        retry,
      };
    }
    const current = perf && perf.id === performanceId ? perf : null;
    const rows = current?.availability ? availabilityRows(current.availability) : [];
    return {
      rows,
      loading: Boolean(performanceId) && !current,
      failed: Boolean(current?.failed) && !current?.availability,
      soldOut: isSoldOut(rows),
      retry,
    };
  }, [preview, source, legacyId, live, perf, performanceId, retry]);
}

export type DateInfo = { minPrice: number | null; soldOut: boolean };

/** From-prices and sold-out flags for the date cards, loaded once per date. */
export function useDateInfos(source: DetailSource | null, preview: boolean) {
  const [infos, setInfos] = useState<Record<string, DateInfo>>({});
  useEffect(() => {
    if (!source || preview || source.dates.length < 2) return;
    const controller = new AbortController();
    const loaded = (date: DetailDate) => {
      const done = (rows: TicketRow[]) => {
        const open = rows.filter((row) => row.available > 0);
        const prices = (open.length ? open : rows).map((row) => row.price);
        return { minPrice: prices.length ? Math.min(...prices) : null, soldOut: isSoldOut(rows) };
      };
      return date.legacyConcertId
        ? getConcertTicketTypes(date.legacyConcertId, controller.signal).then((types) =>
            done(types.filter((type) => type.isActive).map(typeRow)),
          )
        : getAvailability(date.id, controller.signal).then((availability) =>
            done(availabilityRows(availability)),
          );
    };
    for (const date of source.dates.slice(0, 24)) {
      loaded(date)
        .then((info) => {
          if (!controller.signal.aborted) setInfos((current) => ({ ...current, [date.id]: info }));
        })
        .catch(() => undefined);
    }
    return () => controller.abort();
  }, [source, preview]);
  return infos;
}
