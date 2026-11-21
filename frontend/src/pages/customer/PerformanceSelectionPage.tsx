import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ApiClientError, isRequestCanceled } from '../../api/client';
import { getOrderByIdempotencyKey } from '../../api/orders';
import {
  checkoutPerformance, eventPath, getAvailability, getEventPerformance, getHold, getLayout,
  getMapSection, getSectionAvailability, performancePath, replaceHold, type Availability,
  type Layout, type MapSection, type Offer, type PerformanceHold, type Point, type SectionAvailability, type Selection,
} from '../../api/performances';
import { clearStoredQueueAdmission, getStoredQueueAdmission } from '../../api/queue';
import { currency } from '../../data/formatters';
import { performanceTime } from '../../features/performance/format';
import { mapBounds, mapSeatRadius, sectionViewBox } from '../../features/performance/layoutTools';

const emptyHold: PerformanceHold = { version: 0, items: [], totalAmount: 0, expiresAt: null };
const points = (vertices: Point[]) => vertices.map(({ x, y }) => x + ',' + y).join(' ');

export function PerformanceSelectionPage() {
  const { id, eventId } = useParams();
  return id && eventId ? <PerformanceSelection key={id} id={id} eventId={eventId} /> : <Navigate to="/events" replace />;
}

function PerformanceSelection({ id, eventId }: { id: string; eventId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [admission] = useState(() => getStoredQueueAdmission(id));
  const checkoutKey = 'ticketbox.performance-checkout.' + id;
  const [pendingOrderKey, setPendingOrderKey] = useState(() => sessionStorage.getItem(checkoutKey));
  const [context, setContext] = useState<Awaited<ReturnType<typeof getEventPerformance>> | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [sectionLayout, setSectionLayout] = useState<{ version: number; section: MapSection } | null>(null);
  const [sectionAvailability, setSectionAvailability] = useState<SectionAvailability | null>(null);
  const [chosenOffers, setChosenOffers] = useState<Record<string, string>>({});
  const [hold, setHold] = useState<PerformanceHold>(emptyHold);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [accessibleOnly, setAccessibleOnly] = useState(false);
  const [visibleRows, setVisibleRows] = useState(20);
  const transaction = useRef<string | null>(null);
  const recovery = useRef<{ payload: string; key: string } | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!pendingOrderKey) return;
    let canceled = false;
    getOrderByIdempotencyKey(pendingOrderKey).then((order) => {
      if (canceled) return;
      sessionStorage.removeItem(checkoutKey);
      clearStoredQueueAdmission();
      navigate('/checkout?orderId=' + encodeURIComponent(order.id), { replace: true });
    }).catch((requestError) => {
      if (canceled) return;
      if (requestError instanceof ApiClientError && requestError.status === 404) {
        setBusy(false);
        if (!admission) {
          sessionStorage.removeItem(checkoutKey);
          setPendingOrderKey(null);
        }
      } else setError(t('performances:verifyOrderFailed'));
    });
    return () => { canceled = true; };
    // The checkout action handles immediate recovery and saves its key for a subsequent mount.
  }, [admission, checkoutKey, navigate, pendingOrderKey, t]);

  useEffect(() => {
    if (!admission) return;
    const controller = new AbortController();
    const { signal } = controller;
    let timer: number | undefined;
    let first = true;

    getEventPerformance(eventId, id, signal).then((detail) => {
      if (signal.aborted) return;
      setContext(detail);
      if (detail.performance.layoutVersion != null) {
        void getLayout(id, signal).then((map) => {
          if (!signal.aborted) setLayout(map);
        }).catch(() => {
          if (!signal.aborted) setLayout(null);
        });
      }
    }).catch(() => {
      if (!signal.aborted) setError(t('performances:loadFailed'));
    });

    getHold(id, admission.queueAccessToken, signal).then((current) => {
      if (!signal.aborted) setHold(current);
    }).catch((requestError) => {
      if (!signal.aborted && !isRequestCanceled(requestError)) {
        if (requestError instanceof ApiClientError && [401, 403].includes(requestError.status)) {
          clearStoredQueueAdmission();
          navigate(performancePath(eventId, id) + '/waiting-room', { replace: true });
        } else setError(t('performances:loadFailed'));
      }
    }).finally(() => { if (!signal.aborted) setBusy(false); });

    async function loadAvailability() {
      try {
        if (first || !document.hidden) {
          const next = await getAvailability(id, signal);
          if (!signal.aborted) setAvailability(next);
        }
      } catch {
        if (!signal.aborted && first) setError(t('performances:loadFailed'));
      } finally {
        first = false;
        if (!signal.aborted) timer = window.setTimeout(loadAvailability, 8000 + Math.random() * 2000);
      }
    }
    void loadAvailability();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [admission, eventId, id, navigate, refresh, t]);

  const activeSection = availability?.groups.find((group) => group.sectionId === selectedSection);
  const assigned = activeSection?.kind === 'ASSIGNED';
  useEffect(() => {
    if (!selectedSection || !assigned) return;
    const controller = new AbortController();
    const { signal } = controller;
    let timer: number | undefined;

    getMapSection(id, selectedSection, signal).then((detail) => {
      if (!signal.aborted) setSectionLayout(detail);
    }).catch(() => {
      if (!signal.aborted) setError(t('performances:sectionFailed'));
    });

    async function refreshSection(sectionId: string, first: boolean) {
      try {
        if (first || !document.hidden) {
          const current = await getSectionAvailability(id, sectionId, signal);
          if (!signal.aborted) setSectionAvailability(current);
        }
      } catch {
        if (!signal.aborted && first) setError(t('performances:sectionFailed'));
      } finally {
        if (!signal.aborted) timer = window.setTimeout(() => void refreshSection(sectionId, false), 8000 + Math.random() * 2000);
      }
    }
    void refreshSection(selectedSection, true);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [id, selectedSection, assigned, refresh, t]);

  if (!admission && !pendingOrderKey) return <Navigate to={performancePath(eventId, id) + '/waiting-room'} replace />;

  const selectedMapSection = sectionLayout?.section.id === selectedSection && sectionLayout?.version === availability?.layoutVersion
    ? sectionLayout.section : null;
  const sectionStock = sectionAvailability?.sectionId === selectedSection && sectionAvailability?.layoutVersion === availability?.layoutVersion
    ? sectionAvailability : null;
  const stock = new Map(sectionStock?.seats.map((seat) => [seat.id, seat]));
  const heldSeats = new Set(hold.items.flatMap((item) => item.seatId ? [item.seatId] : []));
  const visibleGroups = availability?.groups.filter((group) => group.sectionId === selectedSection) ?? [];
  const offerByGroup = new Map<string, Offer>();
  for (const group of visibleGroups) {
    const offer = group.offers.find((item) => item.active && item.id === chosenOffers[group.id])
      ?? group.offers.find((item) => item.active);
    if (offer) offerByGroup.set(group.id, offer);
  }
  const sections = new Map(
    (availability?.groups ?? []).filter((group) => group.sectionId !== null).map((group) => [group.sectionId!, group.sectionLabel]),
  );
  const sectionChoices = [...sections].sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }));
  const shownLayout = availability?.layoutVersion === layout?.version ? layout : null;
  const cannotChange = busy || !availability || !admission;

  function canSelectSeat(seatId: string) {
    if (cannotChange) return false;
    if (heldSeats.has(seatId)) return true;
    const current = stock.get(seatId);
    return Boolean(current?.available && offerByGroup.has(current.groupId));
  }

  function seatOfferDescription(seatId: string) {
    const held = hold.items.find((item) => item.seatId === seatId);
    if (held) return `${held.offerName} · ${currency.format(held.unitPrice)}`;
    const current = stock.get(seatId);
    const offer = current && offerByGroup.get(current.groupId);
    if (!offer) return t('performances:seatNotOnSale');
    if (!current.available) return t('performances:seatUnavailable');
    return `${offer.name} · ${currency.format(offer.price)}`;
  }

  function selectSection(sectionId: string | null) {
    if (sectionId === selectedSection && error) setRefresh((value) => value + 1);
    setSelectedSection(sectionId);
    setVisibleRows(20);
    setError(null);
  }

  function holdSelections(): Selection[] {
    return hold.items.map((item) => item.seatId
      ? { offerId: item.offerId, seatId: item.seatId }
      : { offerId: item.offerId, quantity: item.quantity });
  }

  async function changeHold(items: Selection[]) {
    if (!admission || !availability || transaction.current) return;
    const layoutVersion = availability.layoutVersion;
    const body = { layoutVersion, holdVersion: hold.version, items };
    const payload = JSON.stringify(body);
    const key = recovery.current?.payload === payload ? recovery.current.key : window.crypto.randomUUID();
    recovery.current = { payload, key };
    transaction.current = key;
    setBusy(true);
    setError(null);
    try {
      const confirmed = await replaceHold(id, admission.queueAccessToken, key, body);
      if (!mounted.current) return;
      setHold(confirmed);
      recovery.current = null;
    } catch (requestError) {
      if (!mounted.current) return;
      if (requestError instanceof ApiClientError && requestError.status === 409) {
        recovery.current = null;
        setRefresh((value) => value + 1);
      }
      setError(requestError instanceof ApiClientError ? requestError.message : t('performances:holdFailed'));
    } finally {
      if (mounted.current) setBusy(false);
      transaction.current = null;
    }
  }

  function changeQuantity(offerId: string, quantity: number) {
    const items = holdSelections().filter((item) => 'seatId' in item || item.offerId !== offerId);
    if (quantity > 0) items.push({ offerId, quantity });
    void changeHold(items);
  }

  function selectSeat(seatId: string) {
    if (!canSelectSeat(seatId)) return;
    const items = holdSelections();
    if (heldSeats.has(seatId)) {
      void changeHold(items.filter((item) => !('seatId' in item) || item.seatId !== seatId));
      return;
    }
    const available = stock.get(seatId);
    const offer = available && offerByGroup.get(available.groupId);
    if (offer) void changeHold([...items, { offerId: offer.id, seatId }]);
  }

  async function checkout() {
    if (!admission || !hold.items.length || transaction.current) return;
    const key = sessionStorage.getItem(checkoutKey) ?? window.crypto.randomUUID();
    sessionStorage.setItem(checkoutKey, key);
    transaction.current = key;
    setBusy(true);
    setError(null);
    try {
      const existing = await getOrderByIdempotencyKey(key).catch((requestError) => {
        if (requestError instanceof ApiClientError && requestError.status === 404) return null;
        throw requestError;
      });
      const order = existing ?? await checkoutPerformance(id, admission.queueAccessToken, key, hold.version);
      if (!mounted.current) return;
      sessionStorage.removeItem(checkoutKey);
      clearStoredQueueAdmission();
      navigate('/checkout?orderId=' + encodeURIComponent(order.id), { replace: true });
    } catch (requestError) {
      if (!mounted.current) return;
      setError(requestError instanceof ApiClientError ? requestError.message : t('performances:verifyOrderFailed'));
    } finally {
      if (mounted.current) setBusy(false);
      transaction.current = null;
    }
  }

  const rowList = selectedMapSection?.rows.slice(0, visibleRows) ?? [];
  const selectedBounds = selectedMapSection ? mapBounds(selectedMapSection.points) : null;
  const seatRadius = selectedBounds && selectedMapSection ? mapSeatRadius(selectedMapSection.rows, selectedBounds) : 1;
  return (
    <section className="performance-page page-width">
      <Link to={eventPath(eventId)}>{context?.event.title ?? t('performances:schedule')}</Link>
      <h1>{t('performances:choose')}</h1>
      {context && <p><time dateTime={context.performance.startsAt}>{performanceTime(context.performance)}</time> · {context.performance.venueName}</p>}
      {error && <p role="alert">{error}</p>}
      {!availability && !error && <p role="status">{t('performances:loading')}</p>}
      {availability && <div className="performance-purchase">
        <div className="performance-panel">
          {shownLayout && (
            <svg className="performance-map" viewBox={`0 0 ${shownLayout.width} ${shownLayout.height}`} aria-hidden="true">
              {shownLayout.backgroundUrl && <image href={shownLayout.backgroundUrl} width={shownLayout.width} height={shownLayout.height} />}
              {shownLayout.shapes.map((shape, index) => (
                <polygon key={index} className="performance-map-shape" points={points(shape.points)}><title>{shape.label}</title></polygon>
              ))}
              {shownLayout.sections.map((section) => {
                const area = mapBounds(section.points);
                const size = Math.min(shownLayout.width / 55, area.height / 3, area.width / Math.max(section.code.length, 3));
                return <g key={section.id} onClick={() => selectSection(section.id)}>
                  <title>{section.label}</title>
                  <polygon className="performance-map-area" points={points(section.points)} data-selected={section.id === selectedSection} />
                  {size >= shownLayout.width / 130 && <text className="performance-map-label" x={area.x + area.width / 2}
                    y={area.y + area.height / 2} fontSize={size}>{section.code}</text>}
                </g>;
              })}
            </svg>
          )}
          {sections.size > 12 ? <label className="performance-section-picker">{t('performances:sections')}
            <select value={selectedSection ?? ''} onChange={(event) => selectSection(event.target.value || null)}>
              <option value="">{t('performances:selectSection')}</option>
              {sectionChoices.map(([sectionId, name]) => <option key={sectionId} value={sectionId}>{name}</option>)}
            </select>
          </label> : sections.size > 0 && <div className="performance-options" aria-label={t('performances:sections')}>
            {sectionChoices.map(([sectionId, name]) => (
              <button className="button button-secondary" key={sectionId} type="button" aria-pressed={sectionId === selectedSection} onClick={() => selectSection(sectionId)}>{name}</button>
            ))}
          </div>}
          {selectedSection && error === t('performances:sectionFailed') &&
            <button className="button button-secondary" type="button" onClick={() => selectSection(selectedSection)}>{t('performances:refresh')}</button>}
          {!selectedSection && !visibleGroups.length && <p>{t('performances:selectSection')}</p>}
          {visibleGroups.filter((group) => group.kind === 'GA').flatMap((group) => group.offers.filter((offer) => offer.active).map((offer) => {
            const quantity = hold.items.find((item) => !item.seatId && item.offerId === offer.id)?.quantity ?? 0;
            return (
              <div className="performance-line" key={offer.id}>
                <div><strong>{offer.name}</strong><p>{currency.format(offer.price)}</p></div>
                <div className="performance-options">
                  <button className="button button-secondary" type="button" aria-label={t('performances:removeOne', { offer: offer.name })} disabled={cannotChange || quantity === 0} onClick={() => changeQuantity(offer.id, quantity - 1)}>−</button>
                  <span>{quantity}</span>
                  <button className="button button-secondary" type="button" aria-label={t('performances:addOne', { offer: offer.name })} disabled={cannotChange || group.available <= 0} onClick={() => changeQuantity(offer.id, quantity + 1)}>+</button>
                </div>
              </div>
            );
          }))}
          {assigned && <div className="performance-panel-inner">
            <label><input type="checkbox" checked={accessibleOnly} onChange={(event) => setAccessibleOnly(event.target.checked)} /> {t('performances:accessibleOnly')}</label>
            {visibleGroups.map((group) => {
              const offers = group.offers.filter((offer) => offer.active);
              if (!offers.length) return null;
              if (offers.length === 1) return <p key={group.id}>{offers[0].name} · {currency.format(offers[0].price)}</p>;
              return <label key={group.id}>{group.sectionLabel}
                <select value={offerByGroup.get(group.id)?.id ?? ''} onChange={(event) => {
                  setChosenOffers({ ...chosenOffers, [group.id]: event.target.value });
                }}>
                  {offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.name} · {currency.format(offer.price)}</option>)}
                </select>
              </label>;
            })}
            {!sectionStock || !selectedMapSection ? <p role="status">{t('performances:loadingSeats')}</p> : (
              <>
                {shownLayout && selectedBounds && <svg className="performance-map" viewBox={sectionViewBox(selectedBounds)} aria-hidden="true">
                  <polygon className="performance-map-area" points={points(selectedMapSection.points)} />
                  {rowList.flatMap((row) => row.seats.filter((seat) => !accessibleOnly || seat.accessible).map((seat) => (
                    <circle key={seat.id} className="performance-map-seat" data-seat-id={seat.id} cx={seat.x} cy={seat.y}
                      r={seatRadius}
                      data-selected={heldSeats.has(seat.id)} aria-disabled={!canSelectSeat(seat.id)}
                      onClick={() => selectSeat(seat.id)}>
                      <title>{t('performances:seat', { row: row.label, seat: seat.label })} · {seatOfferDescription(seat.id)}</title>
                    </circle>
                  )))}
                </svg>}
                <div className="performance-rows">
                  {rowList.map((row) => (
                    <div className="performance-options" key={row.id} aria-label={t('performances:row', { row: row.label })}>
                      <strong>{row.label}</strong>
                      {row.seats.filter((seat) => !accessibleOnly || seat.accessible).map((seat) => (
                        <button key={seat.id} type="button" className="button button-secondary"
                          aria-pressed={heldSeats.has(seat.id)}
                          aria-label={t('performances:seat', { row: row.label, seat: seat.label }) + (seat.accessible ? ' · ' + t('performances:accessible') : '') + (seat.restrictedView ? ' · ' + t('performances:restrictedView') : '')}
                          aria-description={seatOfferDescription(seat.id)}
                          disabled={!canSelectSeat(seat.id)}
                          onClick={() => selectSeat(seat.id)}>{seat.label}</button>
                      ))}
                    </div>
                  ))}
                </div>
                {selectedMapSection.rows.length > visibleRows && <button type="button" className="button button-secondary" onClick={() => setVisibleRows((value) => value + 20)}>{t('performances:moreRows')}</button>}
              </>
            )}
          </div>}
        </div>
        <aside className="performance-panel" aria-label={t('performances:selection')} aria-busy={busy}>
          <h2>{t('performances:selection')}</h2>
          {hold.items.length ? <ul className="performance-list">{hold.items.map((item) => (
            <li key={item.seatId ?? item.offerId}>
              <div className="performance-line">
                <div><strong>{item.offerName}</strong><p>{item.sectionLabel} {item.seatId ? t('performances:seat', { row: item.rowLabel, seat: item.seatLabel }) : '× ' + item.quantity}</p></div>
                <button type="button" className="button button-secondary" disabled={cannotChange} onClick={() => void changeHold(holdSelections().filter((entry) => item.seatId
                  ? !('seatId' in entry && entry.seatId === item.seatId)
                  : 'seatId' in entry || entry.offerId !== item.offerId))}>{t('performances:remove')}</button>
              </div>
            </li>
          ))}</ul> : <p>{t('performances:noSelection')}</p>}
          <strong aria-live="polite">{currency.format(hold.totalAmount)}</strong>
          {hold.expiresAt && <p>{t('performances:heldUntil', { time: new Date(hold.expiresAt).toLocaleTimeString() })}</p>}
          <button className="button button-primary" type="button" disabled={busy || hold.items.length === 0} onClick={() => void checkout()}>{t('performances:continue')}</button>
        </aside>
      </div>}
    </section>
  );
}
