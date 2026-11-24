import { WorkspaceSelect } from '../../components/WorkspaceSelect';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Armchair,
  ArrowDownToLine,
  Copy,
  Footprints,
  Hand,
  ImagePlus,
  Layers,
  MapPin,
  MousePointer2,
  Redo2,
  Square,
  Trash2,
  Undo2,
  UsersRound,
  Workflow,
} from 'lucide-react';
import {
  copyLayoutTemplate,
  createLayoutTemplate,
  listLayoutTemplates,
  readDraftImage,
  readLayoutDraft,
  saveLayout,
  uploadLayoutBackground,
  type DraftLayout,
  type LayoutDraft,
  type LayoutTemplate,
  type ManagedPerformance,
  type Venue,
} from '../../api/performanceManagement';
import type { MapSection, Point, Seat } from '../../api/performances';
import {
  generateSeatGrid,
  maximumLayoutSeats,
  nextRowLabel,
  nextSectionCode,
} from '../../features/performance/layoutAuthoring';
import {
  isSimpleMapPolygon,
  mapPolygonsOverlap,
  moveMapSelection,
  pointInMapPolygon,
  rectanglePoints,
  resizeMapSelection,
} from '../../features/performance/layoutGeometry';
import { mapBounds, readSeatCsv, seatsAlongRow } from '../../features/performance/layoutTools';
import { maxLayoutSvgBytes, readLayoutSvg } from '../../features/performance/layoutSvgImport';
import {
  PerformanceMapCanvas,
  type MapCanvasSelection,
  type MapCanvasTool,
} from './PerformanceMapCanvas';
import './PerformanceLayoutEditor.css';

const blank: DraftLayout = { width: 760, height: 460, shapes: [], sections: [] };
const key = () => window.crypto.randomUUID();
const objectTools = [
  { kind: 'GA', icon: UsersRound, label: 'performance-layout:standing' },
  { kind: 'ASSIGNED', icon: Armchair, label: 'performance-layout:seating' },
  { kind: 'STAGE', icon: Square, label: 'performance-layout:stage' },
  { kind: 'AISLE', icon: Footprints, label: 'performance-layout:aisle' },
  { kind: 'LANDMARK', icon: MapPin, label: 'performance-layout:landmark' },
] as const;
type ObjectKind = (typeof objectTools)[number]['kind'];
type LayoutHistory = { past: DraftLayout[]; present: DraftLayout; future: DraftLayout[] };

export function PerformanceLayoutEditor({
  performance,
  venue,
  saved,
  onSave,
  onDirtyChange,
  onBusyChange,
  readOnly,
  preferredZone = 'ASSIGNED',
}: {
  performance: ManagedPerformance;
  venue?: Venue;
  saved: LayoutDraft;
  onSave: (draft: LayoutDraft) => void;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  readOnly: boolean;
  preferredZone?: 'GA' | 'ASSIGNED';
}) {
  const { t } = useTranslation();
  const [history, setHistory] = useState<LayoutHistory>(() => ({
    past: [],
    present: saved.layout ?? blank,
    future: [],
  }));
  const [editing, setEditing] = useState(!saved.layout);
  const [busy, setBusy] = useState(false);
  const operationInProgress = useRef(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [tool, setTool] = useState<MapCanvasTool>('select');
  const [kind, setKind] = useState<ObjectKind>(preferredZone);
  const [selection, setSelection] = useState<MapCanvasSelection>(null);
  const [shapeMode, setShapeMode] = useState<'rectangle' | 'polygon'>('rectangle');
  const [templates, setTemplates] = useState<LayoutTemplate[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [canvasRevision, setCanvasRevision] = useState(0);
  const [gridRows, setGridRows] = useState('5');
  const [gridSeats, setGridSeats] = useState('12');
  const [firstSeat, setFirstSeat] = useState('1');
  const [aisle, setAisle] = useState(false);
  const [rowSeats, setRowSeats] = useState('12');
  const [rowFirst, setRowFirst] = useState('1');
  const [rowCurve, setRowCurve] = useState(0);
  const sources = useRef<HTMLDetailsElement>(null);
  const inspectorId = useId();
  const venueId = venue?.id;
  const layout = history.present;
  const changed = layout !== (saved.layout ?? blank);
  const editorOpen = editing && !readOnly;
  const sectionId =
    selection?.kind === 'section'
      ? selection.id
      : selection?.kind === 'seat'
        ? selection.sectionId
        : undefined;
  const section = layout.sections.find((entry) => entry.id === sectionId);
  const shapeIndex = selection?.kind === 'shape' ? selection.index : -1;
  const shape = layout.shapes[shapeIndex];
  const seatId = selection?.kind === 'seat' ? selection.id : undefined;
  const selectedRow = seatId
    ? section?.rows.find((row) => row.seats.some((seat) => seat.id === seatId))
    : undefined;
  const selectedSeat = selectedRow?.seats.find((seat) => seat.id === seatId);
  const totalSeats = countSeats(layout);
  const needsPlacement = tool === 'rectangle' || tool === 'polygon';

  useEffect(() => {
    onDirtyChange(changed);
  }, [changed, onDirtyChange]);

  useEffect(() => {
    if (!venueId) return;
    const controller = new AbortController();
    listLayoutTemplates(venueId, controller.signal)
      .then((available) => {
        if (!controller.signal.aborted)
          setTemplates(
            available.filter((entry) => entry.venueSpaceId === performance.venueSpaceId),
          );
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => controller.abort();
  }, [performance.venueSpaceId, venueId]);

  useEffect(() => {
    const url = layout.backgroundUrl;
    if (!url?.startsWith('/api/organizer/manage/v2/performances/')) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    readDraftImage(url, controller.signal)
      .then((blob) => {
        if (!controller.signal.aborted) {
          objectUrl = URL.createObjectURL(blob);
          setImage(objectUrl);
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setImage(null);
    };
  }, [layout.backgroundUrl]);

  function update(next: DraftLayout) {
    if (next === layout) return;
    setHistory((current) => ({
      past: [...current.past.slice(-39), current.present],
      present: next,
      future: [],
    }));
    setError('');
    setStatus('');
  }

  function undo() {
    if (busy || !history.past.length) return;
    setHistory(({ past, present, future }) => ({
      past: past.slice(0, -1),
      present: past[past.length - 1],
      future: [present, ...future],
    }));
    setSelection(null);
    setTool('select');
    setError('');
    setStatus(t('performance-layout:undone'));
  }

  function redo() {
    if (busy || !history.future.length) return;
    setHistory(({ past, present, future }) => ({
      past: [...past, present],
      present: future[0],
      future: future.slice(1),
    }));
    setSelection(null);
    setTool('select');
    setError('');
    setStatus(t('performance-layout:redone'));
  }

  function updateSection(updated: MapSection) {
    update({
      ...layout,
      sections: layout.sections.map((entry) => (entry.id === updated.id ? updated : entry)),
    });
  }

  const chooseSelection = useCallback((next: MapCanvasSelection) => {
    setSelection(next);
    setError('');
  }, []);

  function createObject(points: Point[]) {
    if (!isSimpleMapPolygon(points)) {
      setError(t('performance-layout:invalidOutline'));
      return;
    }
    const isSection = kind === 'GA' || kind === 'ASSIGNED';
    const objects = isSection ? layout.sections : layout.shapes;
    if (objects.length >= 500) {
      setError(t('performance-layout:tooManyObjects'));
      return;
    }
    if (isSection && layout.sections.some((entry) => mapPolygonsOverlap(points, entry.points))) {
      setError(t('performance-layout:overlap'));
      return;
    }

    const base = t(objectTools.find((entry) => entry.kind === kind)!.label);
    const label = nextLabel(objects, base);
    if (isSection) {
      const id = key();
      update({
        ...layout,
        sections: [
          ...layout.sections,
          { id, label, kind, code: nextSectionCode(layout.sections, label), points, rows: [] },
        ],
      });
      setSelection({ kind: 'section', id });
    } else {
      update({ ...layout, shapes: [...layout.shapes, { kind, label, points }] });
      setSelection({ kind: 'shape', index: layout.shapes.length });
    }
    setTool('select');
    setStatus(t('performance-layout:objectAdded', { name: label }));
  }

  function addAtAvailableSpace() {
    const width = layout.width * (kind === 'AISLE' ? 0.1 : kind === 'STAGE' ? 0.28 : 0.24);
    const height = layout.height * (kind === 'STAGE' ? 0.12 : kind === 'AISLE' ? 0.34 : 0.3);
    const position = availableSpace(layout, width, height);
    if (position)
      createObject(rectanglePoints(position, { x: position.x + width, y: position.y + height }));
    else setError(t('performance-layout:noSpace'));
  }

  function addRow(points: Point[]) {
    if (!section || section.kind !== 'ASSIGNED' || section.rows.length >= 1000) return;
    const count = Number(rowSeats);
    const first = Number(rowFirst);
    if (
      !Number.isInteger(first) ||
      first < 1 ||
      !Number.isSafeInteger(first + count - 1) ||
      totalSeats + count > maximumLayoutSeats
    ) {
      setError(t('performance-layout:invalidGrid'));
      return;
    }
    try {
      const curve =
        (Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) * rowCurve) / 100;
      const coordinates = seatsAlongRow(points[0], points[1], count, curve);
      if (coordinates.some((point) => !pointInMapPolygon(point, section.points))) {
        setError(t('performance-layout:rowOutside'));
        return;
      }
      const label = nextRowLabel(section.rows);
      const seats: Seat[] = coordinates.map((point, index) => ({
        ...point,
        id: key(),
        label: String(first + index),
        accessible: false,
        restrictedView: false,
        blocked: false,
        segment: label,
        position: index + 1,
      }));
      updateSection({
        ...section,
        rows: [...section.rows, { id: key(), code: label, label, seats }],
      });
      setStatus(t('performance-layout:rowAdded', { name: label, count }));
    } catch {
      setError(t('performance-layout:invalidGrid'));
    }
  }

  function addSeatGrid(submit: FormEvent<HTMLFormElement>) {
    submit.preventDefault();
    if (!section || section.kind !== 'ASSIGNED' || section.rows.length) return;
    const rows = Number(gridRows);
    const seats = Number(gridSeats);
    if (totalSeats + rows * seats > maximumLayoutSeats) {
      setError(t('performance-layout:seatLimit'));
      return;
    }
    try {
      const generated = generateSeatGrid(section.points, {
        rows,
        seats,
        firstSeat: Number(firstSeat),
        aisle: aisle && seats > 1,
      });
      const labels: MapSection['rows'] = [];
      for (const row of generated) {
        const label = nextRowLabel(labels);
        labels.push({
          id: key(),
          code: label,
          label,
          seats: row.map(({ segmentSuffix, ...seat }) => ({
            ...seat,
            id: key(),
            segment: label + segmentSuffix,
            accessible: false,
            blocked: false,
            restrictedView: false,
          })),
        });
      }
      updateSection({ ...section, rows: labels });
      setStatus(t('performance-layout:gridAdded', { rows, seats: rows * seats }));
    } catch {
      setError(t('performance-layout:invalidGrid'));
    }
  }

  function duplicateObject() {
    const object = section ?? shape;
    if (!object || selectedSeat || busy) return;
    if ((section ? layout.sections.length : layout.shapes.length) >= 500) {
      setError(t('performance-layout:tooManyObjects'));
      return;
    }
    if (section && totalSeats + countSectionSeats(section) > maximumLayoutSeats) {
      setError(t('performance-layout:seatLimit'));
      return;
    }
    const bounds = mapBounds(object.points);
    const placement = availableSpace(layout, bounds.width, bounds.height, bounds);
    if (!placement) {
      setError(t('performance-layout:noSpace'));
      return;
    }
    const move = ({ x, y }: Point) => ({
      x: x + placement.x - bounds.x,
      y: y + placement.y - bounds.y,
    });
    const label = nextLabel(section ? layout.sections : layout.shapes, object.label);
    if (section) {
      const id = key();
      update({
        ...layout,
        sections: [
          ...layout.sections,
          {
            ...section,
            id,
            label,
            code: nextSectionCode(layout.sections, label),
            points: section.points.map(move),
            rows: section.rows.map((row) => ({
              ...row,
              id: key(),
              seats: row.seats.map((seat) => ({ ...seat, ...move(seat), id: key() })),
            })),
          },
        ],
      });
      setSelection({ kind: 'section', id });
    } else if (shape) {
      update({
        ...layout,
        shapes: [...layout.shapes, { ...shape, label, points: shape.points.map(move) }],
      });
      setSelection({ kind: 'shape', index: layout.shapes.length });
    }
    setStatus(t('performance-layout:objectAdded', { name: label }));
  }

  function removeObject() {
    if (section && selectedSeat) {
      updateSection({
        ...section,
        rows: section.rows
          .map((row) => ({
            ...row,
            seats: row.seats.filter((seat) => seat.id !== selectedSeat.id),
          }))
          .filter((row) => row.seats.length > 0),
      });
      setSelection({ kind: 'section', id: section.id });
    } else if (section) {
      if (section.rows.length && !window.confirm(t('performances:removeSection'))) return;
      update({ ...layout, sections: layout.sections.filter((entry) => entry.id !== section.id) });
      setSelection(null);
    } else if (shape) {
      update({ ...layout, shapes: layout.shapes.filter((_, index) => index !== shapeIndex) });
      setSelection(null);
    }
    setStatus(t('performance-layout:objectRemoved'));
  }

  function editName(label: string) {
    const trimmed = label.trim();
    if (!trimmed.length) {
      setError(t('performance-layout:nameRequired'));
      return;
    }
    if (section && selectedSeat) {
      if (
        selectedRow?.seats.some((seat) => seat.id !== selectedSeat.id && seat.label === trimmed)
      ) {
        setError(t('performance-layout:duplicateSeatLabel'));
        return;
      }
      editSeat({ label: trimmed });
    } else if (section) updateSection({ ...section, label: trimmed });
    else if (shape)
      update({
        ...layout,
        shapes: layout.shapes.map((entry, index) =>
          index === shapeIndex ? { ...entry, label: trimmed } : entry,
        ),
      });
  }

  function editSeat(patch: Partial<Seat>) {
    if (!section || !selectedSeat) return;
    updateSection({
      ...section,
      rows: section.rows.map((row) =>
        row.id !== selectedRow?.id
          ? row
          : {
              ...row,
              seats: row.seats.map((seat) =>
                seat.id === selectedSeat.id ? { ...seat, ...patch } : seat,
              ),
            },
      ),
    });
  }

  function applyGeometry(next: DraftLayout) {
    if (next === layout) setError(t('performance-layout:moveBlocked'));
    else update(next);
  }

  function handleShortcuts(event: KeyboardEvent<HTMLElement>) {
    if (
      !editorOpen ||
      busy ||
      (event.target instanceof HTMLElement &&
        event.target.closest('input,textarea,select,[contenteditable]'))
    )
      return;
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    }
    if (event.key.toLowerCase() === 'd' && (section || shape) && !selectedSeat) {
      event.preventDefault();
      duplicateObject();
    }
  }

  async function importSeats(file: File) {
    await runOperation(
      async () => {
        if (file.size > 5 * 1024 * 1024) throw new Error('1');
        const entries = readSeatCsv(await file.text());
        const next = structuredClone(layout);
        const sections = new Map(next.sections.map((entry) => [entry.code, entry]));
        const rowIndex = new Map(
          next.sections.map((entry) => [
            entry.id,
            new Map(
              entry.rows.map((row) => [
                row.code,
                { row, labels: new Set(row.seats.map((seat) => seat.label)) },
              ]),
            ),
          ]),
        );
        for (const [index, entry] of entries.entries()) {
          const target = sections.get(entry.section);
          if (
            !target ||
            target.kind !== 'ASSIGNED' ||
            !pointInMapPolygon(entry, target.points) ||
            totalSeats + index >= maximumLayoutSeats
          )
            throw new Error(String(index + 2));
          const rows = rowIndex.get(target.id)!;
          let indexed = rows.get(entry.row);
          if (!indexed) {
            if (target.rows.length >= 1000 || entry.row.length > 100)
              throw new Error(String(index + 2));
            const row: MapSection['rows'][number] = {
              id: key(),
              code: entry.row,
              label: entry.row,
              seats: [],
            };
            target.rows.push(row);
            indexed = { row, labels: new Set() };
            rows.set(entry.row, indexed);
          }
          const { row, labels } = indexed;
          if (labels.has(entry.seat) || row.seats.length >= 1000 || entry.seat.length > 100)
            throw new Error(String(index + 2));
          labels.add(entry.seat);
          row.seats.push({
            id: key(),
            x: entry.x,
            y: entry.y,
            label: entry.seat,
            accessible: false,
            restrictedView: false,
            blocked: false,
            segment: row.code,
            position: row.seats.length + 1,
          });
        }
        update(next);
        if (sources.current) sources.current.open = false;
        setStatus(t('performances:csvImported', { items: entries.length }));
      },
      (failure) =>
        t('performances:csvError', { line: failure instanceof Error ? failure.message : '?' }),
    );
  }

  async function importSvg(file: File) {
    await runOperation(
      async () => {
        if (file.size > maxLayoutSvgBytes) throw new Error();
        const next = readLayoutSvg(await file.text());
        if (
          (changed || layout.sections.length || layout.shapes.length || layout.backgroundUrl) &&
          !window.confirm(t('performances:svgReplace'))
        )
          return;
        update(next);
        setSelection(next.sections.length ? { kind: 'section', id: next.sections[0].id } : null);
        setTool('select');
        setEditing(true);
        setCanvasRevision((value) => value + 1);
        if (sources.current) sources.current.open = false;
        setStatus(
          t('performances:svgImported', {
            sections: next.sections.length,
            seats: countSeats(next),
          }),
        );
      },
      () => t('performances:svgImportError'),
    );
  }

  function accept(next: LayoutDraft, resetCanvas = false) {
    setHistory({ past: [], present: next.layout ?? blank, future: [] });
    onSave(next);
    if (resetCanvas) {
      setSelection(null);
      setTool('select');
      setCanvasRevision((value) => value + 1);
      if (sources.current) sources.current.open = false;
    }
    setStatus(t('performances:saved'));
  }

  async function runOperation(
    action: () => Promise<void>,
    message = (failure: unknown) =>
      failure instanceof Error ? failure.message : t('performances:saveFailed'),
  ) {
    if (operationInProgress.current || readOnly) return;
    operationInProgress.current = true;
    setBusy(true);
    onBusyChange(true);
    setError('');
    setStatus('');
    try {
      await action();
    } catch (failure) {
      setError(message(failure));
    } finally {
      operationInProgress.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }

  async function submit(action: () => Promise<LayoutDraft>, resetCanvas = false) {
    await runOperation(async () => accept(await action(), resetCanvas));
  }

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!venueId || changed) return;
    const form = event.currentTarget;
    const name = String(new FormData(form).get('templateName') ?? '').trim();
    if (!name) return;
    await runOperation(async () => {
      const template = await createLayoutTemplate(venueId, performance.venueSpaceId, name, layout);
      setTemplates((current) => [...current, template]);
      setTemplateId(template.id);
      form.reset();
      setStatus(t('performance-layout:templateSaved'));
    });
  }

  const template = templates.find((entry) => entry.id === templateId);
  const objectName = selectedSeat?.label ?? section?.label ?? shape?.label;
  const currentKind = objectTools.find((entry) => entry.kind === kind)!;
  const heading = t(editorOpen ? 'performance-layout:editorHeading' : 'performances:layout');
  const details = (
    <aside className="layout-editor-inspector" aria-labelledby={inspectorId}>
      <h3 id={inspectorId}>{t('performance-layout:properties')}</h3>
      {needsPlacement ? (
        <>
          <strong>{t(currentKind.label)}</strong>
          <p>
            {t(
              tool === 'polygon'
                ? 'performance-layout:polygonHelp'
                : 'performance-layout:rectangleHelp',
            )}
          </p>
          <button
            className="button button-secondary"
            type="button"
            disabled={busy}
            onClick={addAtAvailableSpace}
          >
            {t('performance-layout:addAtAvailableSpace')}
          </button>
        </>
      ) : objectName ? (
        <>
          <form
            className="layout-editor-rename"
            key={objectName + (section?.id ?? shapeIndex)}
            onSubmit={(event) => {
              event.preventDefault();
              editName(String(new FormData(event.currentTarget).get('label') ?? ''));
            }}
          >
            <label>
              {t(selectedSeat ? 'performance-layout:seatLabel' : 'performance-layout:objectName')}
              <input
                name="label"
                defaultValue={objectName}
                required
                maxLength={selectedSeat ? 100 : 200}
                disabled={busy}
              />
            </label>
            <button className="button button-secondary" type="submit" disabled={busy}>
              {t('performance-layout:rename')}
            </button>
          </form>
          {selectedSeat ? (
            <div className="layout-editor-seat-flags">
              <p>{t('performances:seat', { row: selectedRow?.label, seat: selectedSeat.label })}</p>
              <label>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={selectedSeat.accessible}
                  onChange={(event) => editSeat({ accessible: event.target.checked })}
                />{' '}
                {t('performances:accessible')}
              </label>
              <label>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={selectedSeat.restrictedView}
                  onChange={(event) => editSeat({ restrictedView: event.target.checked })}
                />{' '}
                {t('performances:restrictedView')}
              </label>
              <label>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={selectedSeat.blocked}
                  onChange={(event) => editSeat({ blocked: event.target.checked })}
                />{' '}
                {t('performances:blockedSeat')}
              </label>
              <button
                className="button button-secondary"
                type="button"
                disabled={busy || !section}
                onClick={() => {
                  if (section) chooseSelection({ kind: 'section', id: section.id });
                }}
              >
                {t('performance-layout:backToSection')}
              </button>
            </div>
          ) : (
            section?.kind === 'ASSIGNED' && (
              <>
                {section.rows.length === 0 ? (
                  <form className="layout-editor-grid-form" onSubmit={addSeatGrid}>
                    <h4>{t('performance-layout:generateTitle')}</h4>
                    <p>{t('performance-layout:generateHelp')}</p>
                    <div className="layout-editor-number-fields">
                      <label>
                        {t('performance-layout:rows')}
                        <input
                          type="number"
                          min={1}
                          max={1000}
                          value={gridRows}
                          required
                          onChange={(event) => setGridRows(event.target.value)}
                          disabled={busy}
                        />
                      </label>
                      <label>
                        {t('performance-layout:seatsPerRow')}
                        <input
                          type="number"
                          min={1}
                          max={1000}
                          value={gridSeats}
                          required
                          onChange={(event) => setGridSeats(event.target.value)}
                          disabled={busy}
                        />
                      </label>
                    </div>
                    <label>
                      {t('performances:firstSeat')}
                      <input
                        type="number"
                        min={1}
                        value={firstSeat}
                        required
                        onChange={(event) => setFirstSeat(event.target.value)}
                        disabled={busy}
                      />
                    </label>
                    <label className="layout-editor-checkbox">
                      <input
                        type="checkbox"
                        checked={aisle && Number(gridSeats) >= 2}
                        disabled={busy || Number(gridSeats) < 2}
                        onChange={(event) => setAisle(event.target.checked)}
                      />
                      {t('performance-layout:centerAisle')}
                    </label>
                    <button
                      className="button button-primary"
                      disabled={busy || Number(gridRows) < 1 || Number(gridSeats) < 1}
                    >
                      {t('performance-layout:generateSeats', {
                        count: Number(gridRows) * Number(gridSeats),
                      })}
                    </button>
                  </form>
                ) : (
                  <SeatLookup
                    key={section.id}
                    section={section}
                    disabled={busy}
                    onSelect={(id) =>
                      chooseSelection({
                        kind: 'seat',
                        id,
                        sectionId: section.id,
                      })
                    }
                  />
                )}
                {section.rows.length < 1000 && (
                  <div className="layout-editor-row-form">
                    <button
                      type="button"
                      className="button button-secondary"
                      aria-pressed={tool === 'row'}
                      disabled={busy}
                      onClick={() => {
                        setError('');
                        setTool(tool === 'row' ? 'select' : 'row');
                      }}
                    >
                      <Workflow size={17} aria-hidden />
                      {t('performance-layout:drawRow')}
                    </button>
                    {tool === 'row' && (
                      <>
                        <p>
                          {t('performance-layout:rowHelp', { name: nextRowLabel(section.rows) })}
                        </p>
                        <div className="layout-editor-number-fields">
                          <label>
                            {t('performances:seatCount')}
                            <input
                              type="number"
                              min={1}
                              max={1000}
                              value={rowSeats}
                              disabled={busy}
                              onChange={(event) => setRowSeats(event.target.value)}
                            />
                          </label>
                          <label>
                            {t('performances:firstSeat')}
                            <input
                              type="number"
                              min={1}
                              value={rowFirst}
                              disabled={busy}
                              onChange={(event) => setRowFirst(event.target.value)}
                            />
                          </label>
                        </div>
                        <label>
                          {t('performance-layout:rowCurve')}
                          <input
                            type="range"
                            min={-35}
                            max={35}
                            value={rowCurve}
                            disabled={busy}
                            onChange={(event) => setRowCurve(Number(event.target.value))}
                          />
                        </label>
                      </>
                    )}
                  </div>
                )}
              </>
            )
          )}
          <div className="layout-editor-object-actions">
            {!selectedSeat && (
              <button
                className="button button-secondary"
                type="button"
                disabled={busy}
                onClick={duplicateObject}
              >
                <Copy size={16} aria-hidden />
                {t('performance-layout:duplicate')}
              </button>
            )}
            <button
              className="button button-secondary layout-editor-remove"
              type="button"
              disabled={busy}
              onClick={removeObject}
            >
              <Trash2 size={16} aria-hidden />
              {t(selectedSeat ? 'performance-layout:removeSeat' : 'performances:remove')}
            </button>
          </div>
        </>
      ) : (
        <p>
          {t(
            layout.sections.length || layout.shapes.length
              ? 'performance-layout:selectHelp'
              : 'performance-layout:emptyHelp',
          )}
        </p>
      )}
      <div className="layout-editor-object-list">
        <label>
          {t('performance-layout:mapObjects')}
          <WorkspaceSelect
            label={t('performance-layout:mapObjects')}
            value={section ? section.id : shape ? 'shape-' + shapeIndex : ''}
            disabled={busy}
            onChange={(value) => {
              setTool('select');
              chooseSelection(
                value.startsWith('shape-')
                  ? { kind: 'shape', index: Number(value.slice(6)) }
                  : value
                    ? { kind: 'section', id: value }
                    : null,
              );
            }}
            options={[
              { value: '', label: t('performance-layout:chooseObject') },
              ...layout.sections.map(({ id, label }) => ({ value: id, label })),
              ...layout.shapes.map(({ label }, index) => ({ value: 'shape-' + index, label })),
            ]}
          />
        </label>
      </div>
    </aside>
  );

  const sourceControls = (
    <details className="layout-editor-sources" ref={sources}>
      <summary>
        <ArrowDownToLine size={17} aria-hidden />
        {t('performance-layout:sources')}
      </summary>
      <div className="layout-editor-source-grid">
        <label>
          <Layers size={17} aria-hidden />
          {t('performances:svgImport')}
          <small>{t('performance-layout:svgSourceHelp')}</small>
          <input
            type="file"
            accept=".svg,image/svg+xml"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importSvg(file);
              event.target.value = '';
            }}
          />
        </label>
        <label>
          <ImagePlus size={17} aria-hidden />
          {t('performances:background')}
          <small>{t('performance-layout:backgroundHelp')}</small>
          <input
            type="file"
            accept="image/png,image/jpeg"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file)
                void submit(async () => {
                  const current =
                    changed || !saved.version
                      ? await saveLayout(performance.id, saved.version, layout)
                      : saved;
                  if (current !== saved) accept(current);
                  return uploadLayoutBackground(performance.id, current.version, file);
                });
              event.target.value = '';
            }}
          />
        </label>
        {layout.sections.some((area) => area.kind === 'ASSIGNED') && (
          <label>
            {t('performances:importCsv')}
            <small>
              {t('performance-layout:csvSourceHelp', {
                codes: layout.sections
                  .filter((area) => area.kind === 'ASSIGNED')
                  .slice(0, 5)
                  .map((area) => area.code)
                  .join(', '),
              })}
            </small>
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importSeats(file);
                event.target.value = '';
              }}
            />
          </label>
        )}
        {templates.length > 0 && (
          <div>
            <label>
              {t('performances:template')}
              <WorkspaceSelect
                label={t('performances:template')}
                value={templateId}
                disabled={busy}
                onChange={setTemplateId}
                options={[
                  { value: '', label: t('performances:chooseTemplate') },
                  ...templates.map(({ id, name }) => ({ value: id, label: name })),
                ]}
              />
            </label>
            <button
              className="button button-secondary"
              type="button"
              disabled={busy || !template}
              onClick={() => {
                if (template && (!changed || window.confirm(t('performances:discardChanges')))) {
                  void submit(
                    () => copyLayoutTemplate(performance.id, template, saved.version),
                    true,
                  );
                }
              }}
            >
              {t('performances:copyTemplate')}
            </button>
          </div>
        )}
        {venueId && saved.layout?.sections.length ? (
          <form onSubmit={(event) => void saveTemplate(event)}>
            <label>
              {t('performances:templateName')}
              <input name="templateName" maxLength={120} required disabled={busy || changed} />
            </label>
            <button className="button button-secondary" disabled={busy || changed}>
              {t('performances:saveTemplate')}
            </button>
          </form>
        ) : null}
      </div>
      <button
        className="button button-secondary"
        type="button"
        disabled={busy || !saved.version}
        onClick={() => {
          if (!changed || window.confirm(t('performances:discardChanges')))
            void submit(() => readLayoutDraft(performance.id), true);
        }}
      >
        {t('performances:reloadDraft')}
      </button>
    </details>
  );

  return (
    <section
      className="performance-panel layout-editor"
      aria-label={t('performances:layout')}
      onKeyDown={handleShortcuts}
    >
      <header className="layout-editor-header">
        <div>
          <h2>{heading}</h2>
          <p>
            {t('performance-layout:totals', { areas: layout.sections.length, seats: totalSeats })}
          </p>
        </div>
        <div className="layout-editor-actions">
          {!readOnly && (
            <button
              type="button"
              className="button button-secondary"
              disabled={busy}
              onClick={() => {
                setEditing(!editing);
                setTool('select');
              }}
            >
              {t(editorOpen ? 'performances:previewLayout' : 'performances:editLayout')}
            </button>
          )}
          {!readOnly && (editorOpen || changed) && (
            <button
              type="button"
              className="button button-primary"
              disabled={busy || !changed}
              onClick={() => void submit(() => saveLayout(performance.id, saved.version, layout))}
            >
              {t(busy ? 'performances:savingChanges' : 'performances:saveLayout')}
            </button>
          )}
        </div>
      </header>
      {error && (
        <p className="layout-editor-error" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="layout-editor-status" role="status">
          {status}
        </p>
      )}
      {editorOpen && sourceControls}
      {editorOpen && (
        <div
          className="layout-editor-toolbar"
          role="group"
          aria-label={t('performance-layout:tools')}
        >
          <button
            type="button"
            className="layout-editor-tool"
            aria-pressed={tool === 'select'}
            disabled={busy}
            onClick={() => setTool('select')}
          >
            <MousePointer2 size={17} aria-hidden />
            {t('performance-layout:select')}
          </button>
          <button
            type="button"
            className="layout-editor-tool"
            aria-pressed={tool === 'pan'}
            disabled={busy}
            onClick={() => setTool('pan')}
          >
            <Hand size={17} aria-hidden />
            {t('performance-layout:pan')}
          </button>
          <div className="layout-editor-tool-group">
            {objectTools.map(({ kind: id, icon: Icon, label }) => (
              <button
                key={id}
                type="button"
                className="layout-editor-tool"
                aria-pressed={needsPlacement && kind === id}
                disabled={busy}
                onClick={() => {
                  setKind(id);
                  setTool(shapeMode);
                  setCanvasRevision((value) => value + 1);
                  setError('');
                }}
              >
                <Icon size={17} aria-hidden />
                {t(label)}
              </button>
            ))}
          </div>
          <div className="layout-editor-tool-group">
            <button
              type="button"
              className="layout-editor-tool"
              disabled={busy || !history.past.length}
              onClick={undo}
            >
              <Undo2 size={17} aria-hidden />
              {t('performance-layout:undo')}
            </button>
            <button
              type="button"
              className="layout-editor-tool"
              disabled={busy || !history.future.length}
              onClick={redo}
            >
              <Redo2 size={17} aria-hidden />
              {t('performance-layout:redo')}
            </button>
          </div>
        </div>
      )}
      {editorOpen && needsPlacement && (
        <div
          className="layout-editor-outline"
          role="group"
          aria-label={t('performance-layout:outline')}
        >
          <button
            className="layout-editor-tool"
            type="button"
            aria-pressed={shapeMode === 'rectangle'}
            disabled={busy}
            onClick={() => {
              setShapeMode('rectangle');
              setTool('rectangle');
            }}
          >
            {t('performance-layout:rectangle')}
          </button>
          <button
            className="layout-editor-tool"
            type="button"
            aria-pressed={shapeMode === 'polygon'}
            disabled={busy}
            onClick={() => {
              setShapeMode('polygon');
              setTool('polygon');
            }}
          >
            {t('performance-layout:polygon')}
          </button>
        </div>
      )}
      <div className={'layout-editor-main' + (editorOpen ? ' is-editing' : '')}>
        <PerformanceMapCanvas
          layout={layout}
          image={image}
          tool={editorOpen ? tool : 'select'}
          selection={selection}
          readOnly={!editorOpen}
          disabled={busy}
          resetKey={canvasRevision}
          onSelect={chooseSelection}
          onDraw={(points) => (tool === 'row' ? addRow(points) : createObject(points))}
          onMove={(target, delta) => applyGeometry(moveMapSelection(layout, target, delta))}
          onResize={(target, corner) => applyGeometry(resizeMapSelection(layout, target, corner))}
        />
        {editorOpen && details}
      </div>
    </section>
  );
}

function SeatLookup({
  section,
  disabled,
  onSelect,
}: {
  section: MapSection;
  disabled: boolean;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [rowId, setRowId] = useState('');
  const row = section.rows.find((entry) => entry.id === rowId);
  return (
    <div className="layout-editor-seat-lookup">
      <p>
        {t('performance-layout:sectionTotals', {
          rows: section.rows.length,
          seats: countSectionSeats(section),
        })}
      </p>
      <label>
        {t('performance-layout:chooseRow')}
        <WorkspaceSelect
          label={t('performance-layout:chooseRow')}
          value={rowId}
          disabled={disabled}
          onChange={setRowId}
          options={[
            { value: '', label: t('performance-layout:chooseRow') },
            ...section.rows.map(({ id, label }) => ({ value: id, label })),
          ]}
        />
      </label>
      {row && (
        <label>
          {t('performances:editSeat')}
          <WorkspaceSelect
            label={t('performances:editSeat')}
            value=""
            disabled={disabled}
            onChange={onSelect}
            placeholder={t('performances:editSeat')}
            options={row.seats.map(({ id, label }) => ({ value: id, label }))}
          />
        </label>
      )}
    </div>
  );
}

function nextLabel(objects: { label: string }[], base: string) {
  const used = new Set(objects.map(({ label }) => label));
  if (!used.has(base)) return base;
  let suffix = 2;
  const prefix = base.slice(0, 190);
  while (used.has(`${prefix} ${suffix}`)) suffix++;
  return `${prefix} ${suffix}`;
}

function availableSpace(layout: DraftLayout, width: number, height: number, near?: Point) {
  const padding = Math.min(layout.width, layout.height) / 40;
  const objects = [...layout.sections, ...layout.shapes];
  const available = (point: Point) => {
    if (
      point.x < 0 ||
      point.y < 0 ||
      point.x + width > layout.width ||
      point.y + height > layout.height
    )
      return false;
    const outline = rectanglePoints(point, { x: point.x + width, y: point.y + height });
    return !objects.some((item) => mapPolygonsOverlap(item.points, outline));
  };
  const center = { x: (layout.width - width) / 2, y: (layout.height - height) / 2 };
  const candidates = near
    ? [
        { x: near.x + width + padding, y: near.y },
        { x: near.x, y: near.y + height + padding },
        { x: near.x - width - padding, y: near.y },
        { x: near.x, y: near.y - height - padding },
      ]
    : [center];
  const preferred = candidates.find(available);
  if (preferred) return preferred;
  for (let row = 0; row <= 8; row++) {
    for (let column = 0; column <= 8; column++) {
      const point = {
        x: ((layout.width - width) * column) / 8,
        y: ((layout.height - height) * row) / 8,
      };
      if (available(point)) return point;
    }
  }
}

function countSectionSeats(section: MapSection) {
  return section.rows.reduce((total, row) => total + row.seats.length, 0);
}

function countSeats(layout: DraftLayout) {
  return layout.sections.reduce((total, section) => total + countSectionSeats(section), 0);
}
