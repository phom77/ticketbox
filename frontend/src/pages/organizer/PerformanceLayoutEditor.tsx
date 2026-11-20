import { useEffect, useState, type FormEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  copyLayoutTemplate, createLayoutTemplate, listLayoutTemplates, readDraftImage, readLayoutDraft,
  saveLayout, uploadLayoutBackground,
  type DraftLayout, type LayoutDraft, type LayoutTemplate, type ManagedPerformance, type Venue,
} from '../../api/performanceManagement';
import type { MapSection, Point, Seat, SectionKind } from '../../api/performances';
import { readSeatCsv, seatsAlongRow } from '../../features/performance/layoutTools';

const blank: DraftLayout = { width: 760, height: 460, shapes: [], sections: [] };
const polygon = (points: Point[]) => points.map((point) => point.x + ',' + point.y).join(' ');
const key = () => window.crypto.randomUUID();
const drawingModes = ['GA', 'ASSIGNED', 'STAGE', 'AISLE', 'LANDMARK', 'ROW'] as const;
type DrawingMode = (typeof drawingModes)[number];

export function PerformanceLayoutEditor({ performance, venue, saved, onSave, readOnly }: {
  performance: ManagedPerformance;
  venue?: Venue;
  saved: LayoutDraft;
  onSave: (draft: LayoutDraft) => void;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const [layout, setLayout] = useState(saved.layout ?? blank);
  const [version, setVersion] = useState(saved.version);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState<DrawingMode>('GA');
  const [vertices, setVertices] = useState<Point[]>([]);
  const [sectionId, setSectionId] = useState('');
  const [templates, setTemplates] = useState<LayoutTemplate[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);

  const venueId = venue?.id;
  useEffect(() => {
    if (!venueId) return;
    const controller = new AbortController();
    listLayoutTemplates(venueId, controller.signal).then((available) => {
      if (!controller.signal.aborted) setTemplates(available.filter((entry) => entry.venueSpaceId === performance.venueSpaceId));
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, [performance.venueSpaceId, venueId]);

  useEffect(() => {
    const url = layout.backgroundUrl;
    if (!url?.startsWith('/api/organizer/manage/v2/performances/')) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    readDraftImage(url, controller.signal).then((blob) => {
      if (!controller.signal.aborted) {
        objectUrl = URL.createObjectURL(blob);
        setImage(objectUrl);
      }
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setImage(null);
    };
  }, [layout.backgroundUrl]);

  const section = layout.sections.find((entry) => entry.id === sectionId);
  const selectedSeat = section?.rows.flatMap((row) => row.seats).find((seat) => seat.id === selectedSeatId);

  function update(next: DraftLayout) {
    setLayout(next);
    setChanged(true);
    setError('');
    setStatus('');
  }

  function updateSection(updated: MapSection) {
    update({ ...layout, sections: layout.sections.map((entry) => entry.id === updated.id ? updated : entry) });
  }

  function addPoint(point: Point) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)
      || point.x < 0 || point.x > layout.width || point.y < 0 || point.y > layout.height) {
      setError(t('performances:coordinateError'));
      return;
    }
    if (mode === 'ROW' && vertices.length === 2) setVertices([point]);
    else setVertices([...vertices, point]);
  }

  function mapPoint(event: MouseEvent<SVGSVGElement>) {
    if (!editing || readOnly) return;
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return;
    const mapped = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    addPoint({ x: Math.round(mapped.x * 10) / 10, y: Math.round(mapped.y * 10) / 10 });
  }

  function finishDrawing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const label = String(values.get('label') ?? '').trim();
    const code = String(values.get('code') ?? '').trim() || label;
    if (!label || !code || vertices.length < (mode === 'ROW' ? 2 : 3)) {
      setError(t('performances:drawingIncomplete'));
      return;
    }
    if (mode === 'GA' || mode === 'ASSIGNED') {
      const id = key();
      update({ ...layout, sections: [...layout.sections, { id, code, label, kind: mode as SectionKind, points: vertices, rows: [] }] });
      setSectionId(id);
    } else if (mode === 'ROW' && section?.kind === 'ASSIGNED') {
      const count = Number(values.get('count'));
      const first = Number(values.get('firstSeat'));
      try {
        const coordinates = seatsAlongRow(vertices[0], vertices[1], count, Number(values.get('curve')));
        const seats: Seat[] = coordinates.map((point, index) => ({
          ...point, id: key(), label: String(first + index), accessible: false, restrictedView: false,
          blocked: false, segment: code, position: index + 1,
        }));
        updateSection({ ...section, rows: [...section.rows, { id: key(), code, label, seats }] });
      } catch {
        setError(t('performances:drawingIncomplete'));
        return;
      }
    } else if (mode !== 'ROW') {
      update({ ...layout, shapes: [...layout.shapes, { label, kind: mode, points: vertices }] });
    } else {
      setError(t('performances:selectAssignedSection'));
      return;
    }
    setVertices([]);
  }

  async function importSeats(file: File) {
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('1');
      const entries = readSeatCsv(await file.text());
      const next = structuredClone(layout);
      const sections = new Map(next.sections.map((entry) => [entry.code, entry]));
      for (const [index, entry] of entries.entries()) {
        const target = sections.get(entry.section);
        if (!target || target.kind !== 'ASSIGNED' || entry.x < 0 || entry.y < 0 || entry.x > next.width || entry.y > next.height) {
          throw new Error(String(index + 2));
        }
        let row = target.rows.find((item) => item.code === entry.row);
        if (!row) {
          row = { id: key(), code: entry.row, label: entry.row, seats: [] };
          target.rows.push(row);
        }
        if (row.seats.some((seat) => seat.label === entry.seat)) throw new Error(String(index + 2));
        row.seats.push({
          id: key(), x: entry.x, y: entry.y, label: entry.seat, accessible: false, restrictedView: false,
          blocked: false, segment: row.code, position: row.seats.length + 1,
        });
      }
      update(next);
      setStatus(t('performances:csvImported', { items: entries.length }));
    } catch (failure) {
      setError(t('performances:csvError', { line: failure instanceof Error ? failure.message : '?' }));
    }
  }

  function accept(next: LayoutDraft) {
    setLayout(next.layout ?? blank);
    setVersion(next.version);
    setChanged(false);
    setVertices([]);
    onSave(next);
    setStatus(t('performances:saved'));
  }

  async function submit(action: () => Promise<LayoutDraft>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      accept(await action());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('performances:saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!venueId || busy) return;
    const name = String(new FormData(event.currentTarget).get('templateName') ?? '').trim();
    setBusy(true);
    setError('');
    try {
      const template = await createLayoutTemplate(venueId, performance.venueSpaceId, name, layout);
      setTemplates((current) => [...current, template]);
      setTemplateId(template.id);
      setStatus(t('performances:saved'));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('performances:saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  const template = templates.find((entry) => entry.id === templateId);
  const editorOpen = editing && !readOnly;
  const shownSeats = section?.rows.flatMap((row) => row.seats.slice(0, 120)).slice(0, 2000) ?? [];
  return (
    <section className="performance-panel" aria-label={t('performances:layout')}>
      <div className="performance-actions">
        <h2>{t('performances:layout')}</h2>
        {!readOnly && <button className="button button-secondary" type="button" onClick={() => setEditing(!editing)}>{t(editorOpen ? 'performances:previewLayout' : 'performances:editLayout')}</button>}
      </div>
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      {editorOpen && <div className="performance-options">
        <button className="button button-primary" type="button" disabled={busy || !changed} onClick={() => void submit(() => saveLayout(performance.id, version, layout))}>{t('performances:saveLayout')}</button>
        <button className="button button-secondary" type="button" disabled={busy} onClick={() => {
          if (!changed || window.confirm(t('performances:discardChanges'))) void submit(() => readLayoutDraft(performance.id));
        }}>{t('performances:reloadDraft')}</button>
        <label>{t('performances:template')}
          <select value={templateId} onChange={(change) => setTemplateId(change.target.value)}>
            <option value="">{t('performances:chooseTemplate')}</option>
            {templates.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
        </label>
        <button className="button button-secondary" type="button" disabled={busy || !template} onClick={() => {
          if (template && (!changed || window.confirm(t('performances:discardChanges')))) {
            void submit(() => copyLayoutTemplate(performance.id, template, version));
          }
        }}>{t('performances:copyTemplate')}</button>
      </div>}
      <svg className={'performance-map editor-map' + (editorOpen ? ' is-editing' : '')}
        viewBox={`0 0 ${layout.width} ${layout.height}`} aria-hidden="true" onClick={mapPoint}>
        {image && <image href={image} width={layout.width} height={layout.height} />}
        {layout.shapes.map((shape, index) => <polygon className="performance-map-shape" key={index} points={polygon(shape.points)}><title>{shape.label}</title></polygon>)}
        {layout.sections.map((entry) => <polygon className="performance-map-area" key={entry.id}
          data-selected={sectionId === entry.id} points={polygon(entry.points)}><title>{entry.label}</title></polygon>)}
        {shownSeats.map((seat) => <circle key={seat.id} className="performance-map-seat"
          cx={seat.x} cy={seat.y} r={Math.max(layout.width, layout.height) / 180}
          data-selected={seat.id === selectedSeatId} aria-disabled={seat.blocked}
          onClick={(event) => { if (editorOpen && mode !== 'ROW') { event.stopPropagation(); setSelectedSeatId(seat.id); } }}>
          <title>{seat.label}</title>
        </circle>)}
        {editorOpen && <polyline className="performance-draft-line" points={polygon(vertices)} />}
      </svg>
      {layout.sections.length > 0 && <div className="performance-options">
        {layout.sections.map((entry) => <button key={entry.id} className="button button-secondary" type="button"
          aria-pressed={entry.id === sectionId} onClick={() => { setSectionId(entry.id); setSelectedSeatId(null); }}>{entry.label}</button>)}
      </div>}
      {editorOpen && <>
        <form className="performance-form" onSubmit={finishDrawing}>
          <label>{t('performances:drawMode')}
            <select value={mode} onChange={(change) => { setMode(change.target.value as DrawingMode); setVertices([]); }}>
              {drawingModes.map((entry) => <option key={entry} value={entry}>{t(`performances:drawing_${entry}`)}</option>)}
            </select>
          </label>
          <label>{t('performances:name')}<input name="label" required maxLength={200} /></label>
          <label>{t('performances:code')}<input name="code" maxLength={80} /></label>
          {mode === 'ROW' && <>
            <label>{t('performances:seatCount')}<input name="count" type="number" min={1} max={1000} defaultValue={10} required /></label>
            <label>{t('performances:firstSeat')}<input name="firstSeat" type="number" min={1} defaultValue={1} required /></label>
            <label>{t('performances:curve')}<input name="curve" type="number" defaultValue={0} required /></label>
          </>}
          <p className="performance-wide">{t(mode === 'ROW' ? 'performances:drawRowHelp' : 'performances:drawAreaHelp', { items: vertices.length })}</p>
          <div className="performance-options">
            <button type="button" className="button button-secondary" disabled={!vertices.length} onClick={() => setVertices(vertices.slice(0, -1))}>{t('performances:undoPoint')}</button>
            <button className="button button-secondary" type="submit">{t('performances:finishDrawing')}</button>
          </div>
        </form>
        <form className="performance-form" onSubmit={(event) => {
          event.preventDefault();
          const values = new FormData(event.currentTarget);
          addPoint({ x: Number(values.get('x')), y: Number(values.get('y')) });
        }}>
          <label>{t('performances:coordinateX')}<input name="x" type="number" step="any" min={0} max={layout.width} required /></label>
          <label>{t('performances:coordinateY')}<input name="y" type="number" step="any" min={0} max={layout.height} required /></label>
          <button className="button button-secondary">{t('performances:addPoint')}</button>
        </form>
        <div className="performance-form">
          <label>{t('performances:importCsv')}<input type="file" accept=".csv,text/csv" disabled={busy} onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importSeats(file);
            event.target.value = '';
          }} /></label>
          <label>{t('performances:background')}<input type="file" accept="image/png,image/jpeg" disabled={busy} onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void submit(async () => {
              const current = changed || !version ? await saveLayout(performance.id, version, layout) : { version, layout };
              accept(current);
              return uploadLayoutBackground(performance.id, current.version, file);
            });
            event.target.value = '';
          }} /></label>
        </div>
        {layout.shapes.length > 0 && <details>
          <summary>{t('performances:mapFeatures')}</summary>
          <ul className="performance-list">{layout.shapes.map((shape, index) => (
            <li key={index} className="performance-show">
              <span>{shape.label}</span>
              <button type="button" className="button button-secondary" aria-label={t('performances:removeFeature', { name: shape.label })}
                onClick={() => update({ ...layout, shapes: layout.shapes.filter((_, itemIndex) => index !== itemIndex) })}>{t('performances:remove')}</button>
            </li>
          ))}</ul>
        </details>}
        {section && <details>
          <summary>{t('performances:sectionDetails')} · {section.label}</summary>
          <div className="performance-panel-inner">
            <label>{t('performances:editSeat')}
              <select value={selectedSeatId ?? ''} onChange={(event) => setSelectedSeatId(event.target.value || null)}>
                <option value="">{t('performances:editSeat')}</option>
                {section.rows.map((row) => <optgroup key={row.id} label={row.label}>
                  {row.seats.map((seat) => <option key={seat.id} value={seat.id}>{seat.label}</option>)}
                </optgroup>)}
              </select>
            </label>
            {selectedSeat && <div className="performance-options">
              <label>{t('performances:name')}<input value={selectedSeat.label} onChange={(event) => editSeat({ label: event.target.value })} /></label>
              <label><input type="checkbox" checked={selectedSeat.accessible} onChange={(event) => editSeat({ accessible: event.target.checked })} /> {t('performances:accessible')}</label>
              <label><input type="checkbox" checked={selectedSeat.restrictedView} onChange={(event) => editSeat({ restrictedView: event.target.checked })} /> {t('performances:restrictedView')}</label>
              <label><input type="checkbox" checked={selectedSeat.blocked} onChange={(event) => editSeat({ blocked: event.target.checked })} /> {t('performances:blockedSeat')}</label>
            </div>}
            <button type="button" className="button button-secondary" onClick={() => {
              if (window.confirm(t('performances:removeSection'))) update({ ...layout, sections: layout.sections.filter((entry) => entry.id !== section.id) });
            }}>{t('performances:removeSection')}</button>
          </div>
        </details>}
        {venueId && <form className="performance-form" onSubmit={(event) => void saveTemplate(event)}>
          <label>{t('performances:templateName')}<input name="templateName" maxLength={120} required /></label>
          <button className="button button-secondary" disabled={busy}>{t('performances:saveTemplate')}</button>
        </form>}
      </>}
    </section>
  );

  function editSeat(patch: Partial<Seat>) {
    if (!section || !selectedSeat) return;
    updateSection({ ...section, rows: section.rows.map((row) => ({
      ...row, seats: row.seats.map((seat) => seat.id === selectedSeat.id ? { ...seat, ...patch } : seat),
    })) });
  }
}
