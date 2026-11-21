import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ManagedPerformance, SaleDraft, SaleGroup } from '../../api/performanceManagement';
import type { MapSection, Seat } from '../../api/performances';
import { currency } from '../../data/formatters';
import { assignSeatsToGroup, mapBounds, mapSeatRadius, sectionViewBox } from '../../features/performance/layoutTools';

const rowBatchSize = 20;

export function PerformanceSeatAssignments({ sections, sale, setSale, performance, readOnly }: {
  sections: MapSection[];
  sale: SaleDraft;
  setSale: (sale: SaleDraft) => void;
  performance: ManagedPerformance;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const [sectionId, setSectionId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [visibleRows, setVisibleRows] = useState(rowBatchSize);
  const section = sections.find((item) => item.id === sectionId) ?? sections[0];
  if (!section) return null;

  const groups = sale.groups.filter((group) => group.sectionId === section.id && group.kind === 'ASSIGNED');
  const activeGroup = groups.find((group) => group.id === groupId) ?? groups[0];
  const groupBySeat = new Map(groups.flatMap((group) => group.seats.map((seat) => [seat.id, group.id] as const)));
  const rows = section.rows.slice(0, visibleRows);
  const bounds = mapBounds(section.points);
  const radius = mapSeatRadius(section.rows, bounds);
  const remaining = section.rows.flatMap((row) => row.seats.filter((seat) => !seat.blocked && !groupBySeat.has(seat.id))
    .map((seat) => seatRecord(seat, row.label)));
  const disabled = readOnly || !activeGroup;
  const groupLabels = new Map(groups.map((group, index) => {
    const names = sale.offers.filter((offer) => offer.groupId === group.id && offer.name.trim())
      .map((offer) => `${offer.name} · ${currency.format(offer.price)}`);
    return [group.id, names.join(' / ') || t('performances:unnamedInventoryGroup', { index: index + 1 })];
  }));
  const groupColors = new Map(groups.map((group, index) => [group.id, index % 5]));

  function addTicketType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const name = String(values.get('name') ?? '').trim();
    const price = Number(values.get('price'));
    if (!name || !Number.isSafeInteger(price) || price < 1 || price > 999_999_999_999) return;
    const id = window.crypto.randomUUID();
    setSale({
      ...sale,
      groups: [...sale.groups, { id, sectionId: section.id, sectionLabel: section.label, kind: 'ASSIGNED', capacity: 0, seats: [] }],
      offers: [...sale.offers, { id: window.crypto.randomUUID(), groupId: id, name, price, currency: 'VND', active: true,
        saleStartAt: performance.saleStartAt, saleEndAt: performance.saleEndAt }],
    });
    setGroupId(id);
    form.reset();
  }

  function assign(seats: SaleGroup['seats'], target: string | null) {
    setSale({ ...sale, groups: assignSeatsToGroup(sale.groups, section.id, seats, target) });
  }

  function toggleSeat(seat: Seat, rowLabel: string) {
    if (disabled || seat.blocked || !activeGroup) return;
    assign([seatRecord(seat, rowLabel)], groupBySeat.get(seat.id) === activeGroup.id ? null : activeGroup.id);
  }

  function seatState(seat: Seat) {
    return seat.blocked ? t('performances:blockedSeatLabel')
      : groupLabels.get(groupBySeat.get(seat.id) ?? '') ?? t('performances:unassignedSeat');
  }

  return <section className="performance-admin performance-seat-assignments" id="performance-seat-assignment" aria-label={t('performances:seatAssignment')}>
    <h3>{t('performances:seatAssignment')}</h3>
    <div className="performance-options">
      <label>{t('performances:seatingSection')}
        <select value={section.id} onChange={(event) => {
          setSectionId(event.target.value);
          setGroupId('');
          setVisibleRows(rowBatchSize);
        }}>
          {sections.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
        </select>
      </label>
      <label>{t('performances:assignSeatsTo')}
        <select value={activeGroup?.id ?? ''} disabled={!groups.length} onChange={(event) => setGroupId(event.target.value)}>
          {!groups.length && <option value="">{t('performances:addSeatTypeFirst')}</option>}
          {groups.map((group) => <option key={group.id} value={group.id}>{groupLabels.get(group.id)}</option>)}
        </select>
      </label>
    </div>
    {!readOnly && <form className="performance-form" onSubmit={addTicketType}>
      <label>{t('performances:ticketTypeName')}<input name="name" maxLength={100} required /></label>
      <label>{t('performances:price')}<input name="price" type="number" min={1} max={999999999999} step={1} required /></label>
      <button className="button button-secondary">{t('performances:addSeatedTicketType')}</button>
    </form>}
    {!readOnly && <p>{t('performances:seatAssignmentHelp')}</p>}
    {(groups.length > 0 || remaining.length > 0) && <ul className="performance-seat-legend" aria-label={t('performances:seatCoverage')}>
      {groups.map((group) => <li key={group.id}>
        <span className="performance-seat-swatch" data-ticket-color={groupColors.get(group.id)} aria-hidden="true" />
        {groupLabels.get(group.id)} · {t('performances:seatCountValue', { count: group.capacity })}
      </li>)}
      {remaining.length > 0 && <li><span className="performance-seat-swatch" aria-hidden="true" />
        {t('performances:unassignedSeatCount', { count: remaining.length })}
      </li>}
    </ul>}
    {rows.length > 0 && <svg className="performance-map performance-assignment-map" viewBox={sectionViewBox(bounds)} aria-hidden="true">
      <polygon className="performance-map-area" points={section.points.map(({ x, y }) => `${x},${y}`).join(' ')} />
      {rows.flatMap((row) => row.seats.map((seat) => {
        const currentGroup = groupBySeat.get(seat.id);
        return <g key={seat.id}>
          <circle className="performance-assignment-seat" data-seat-id={seat.id}
            data-ticket-color={groupColors.get(currentGroup ?? '')} data-current={Boolean(activeGroup && currentGroup === activeGroup.id)}
            data-disabled={disabled || seat.blocked} data-blocked={seat.blocked} cx={seat.x} cy={seat.y} r={radius}
            onClick={() => toggleSeat(seat, row.label)}>
            <title>{t('performances:seat', { row: row.label, seat: seat.label })} · {seatState(seat)}</title>
          </circle>
          {radius >= 4 && seat.label.length <= 3 && <text className="performance-map-label" x={seat.x} y={seat.y} fontSize={radius}>
            {seat.label}
          </text>}
        </g>;
      }))}
    </svg>}
    {!readOnly && remaining.length > 0 && <div className="performance-options">
      <button type="button" className="button button-secondary" disabled={disabled} onClick={() => activeGroup && assign(remaining, activeGroup.id)}>
        {t('performances:assignRemainingSection')}
      </button>
    </div>}
    <div className="performance-rows">
      {rows.map((row) => {
        const unassigned = row.seats.filter((seat) => !seat.blocked && !groupBySeat.has(seat.id));
        return <div className="performance-assignment-row" key={row.id} role="group" aria-label={t('performances:row', { row: row.label })}>
          <div className="performance-actions">
            <strong>{t('performances:row', { row: row.label })}</strong>
            {!readOnly && <button type="button" className="button button-secondary" disabled={disabled || !unassigned.length}
              onClick={() => activeGroup && assign(unassigned.map((seat) => seatRecord(seat, row.label)), activeGroup.id)}>
              {t('performances:assignRemainingRow', { row: row.label })}
            </button>}
          </div>
          <div className="performance-options">
            {row.seats.map((seat) => {
              const currentGroup = groupBySeat.get(seat.id);
              return <button type="button" key={seat.id} className="button button-secondary performance-assignment-choice"
                data-ticket-color={groupColors.get(currentGroup ?? '')} disabled={disabled || seat.blocked}
                aria-pressed={Boolean(activeGroup && currentGroup === activeGroup.id)}
                aria-label={t('performances:seat', { row: row.label, seat: seat.label })}
                aria-description={seatState(seat)} title={seatState(seat)}
                onClick={() => toggleSeat(seat, row.label)}>{seat.label}</button>;
            })}
          </div>
        </div>;
      })}
    </div>
    {section.rows.length > visibleRows && <button type="button" className="button button-secondary" onClick={() => setVisibleRows((count) => count + rowBatchSize)}>
      {t('performances:moreRows')}
    </button>}
  </section>;
}

function seatRecord(seat: Seat, rowLabel: string) {
  return { id: seat.id, rowLabel, seatLabel: seat.label, blocked: seat.blocked };
}
