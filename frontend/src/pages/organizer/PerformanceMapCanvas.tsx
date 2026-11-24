import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DraftLayout } from '../../api/performanceManagement';
import type { Point, Seat } from '../../api/performances';
import {
  clampMapMove,
  isSimpleMapPolygon,
  mapResizeScale,
  moveMapSelection,
  polygonBounds,
  rectanglePoints,
  resizeMapSelection,
  type MapCanvasSelection,
} from '../../features/performance/layoutGeometry';
import { mapBounds, mapSeatRadius } from '../../features/performance/layoutTools';
import './PerformanceMapCanvas.css';

export type { MapCanvasSelection };
export type MapCanvasTool = 'select' | 'pan' | 'rectangle' | 'polygon' | 'row';

type Item = NonNullable<MapCanvasSelection>;
type Camera = Point & { zoom: number };
type Gesture = {
  pointerId: number;
  matrix: DOMMatrix;
  origin: Point;
  screenStart: Point;
  camera: Camera;
  selection: MapCanvasSelection;
  resize: Point | null;
  panning: boolean;
};

type Props = {
  layout: DraftLayout;
  image: string | null;
  tool: MapCanvasTool;
  selection: MapCanvasSelection;
  readOnly: boolean;
  disabled?: boolean;
  resetKey?: string | number;
  onSelect: (selection: MapCanvasSelection) => void;
  onDraw: (points: Point[]) => void;
  onMove: (selection: Item, delta: Point) => void;
  onResize?: (selection: Item, corner: Point) => void;
};

const fit: Camera = { x: 0, y: 0, zoom: 1 };
const maxZoom = 12;
const maxVisibleSeats = 2_000;
const zero: Point = { x: 0, y: 0 };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const pointsAttribute = (points: Point[]) => points.map(({ x, y }) => `${x},${y}`).join(' ');
const offset = (point: Point, delta: Point) => ({ x: point.x + delta.x, y: point.y + delta.y });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const instructions: Record<MapCanvasTool, string> = {
  select: 'performances:mapCanvasSelectHelp',
  pan: 'performances:mapCanvasPanHelp',
  rectangle: 'performances:mapCanvasRectangleHelp',
  polygon: 'performances:mapCanvasPolygonHelp',
  row: 'performances:mapCanvasRowHelp',
};

const directions: Record<string, Point> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowRight: { x: 1, y: 0 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
};

function restrictCamera(layout: DraftLayout, camera: Camera) {
  return {
    x: clamp(camera.x, 0, layout.width * (1 - 1 / camera.zoom)),
    y: clamp(camera.y, 0, layout.height * (1 - 1 / camera.zoom)),
    zoom: camera.zoom,
  };
}

function zoomCamera(layout: DraftLayout, camera: Camera, factor: number, at?: Point) {
  const current = restrictCamera(layout, camera);
  const zoom = clamp(current.zoom * factor, 1, maxZoom);
  const anchor = at ?? {
    x: current.x + layout.width / (2 * current.zoom),
    y: current.y + layout.height / (2 * current.zoom),
  };
  return restrictCamera(layout, {
    x: anchor.x - ((anchor.x - current.x) * current.zoom) / zoom,
    y: anchor.y - ((anchor.y - current.y) * current.zoom) / zoom,
    zoom,
  });
}

function selectionAt(target: EventTarget) {
  if (!(target instanceof Element)) return null;
  const seatId = target.closest('[data-map-seat]')?.getAttribute('data-map-seat');
  const sectionId = target.closest('[data-map-section]')?.getAttribute('data-map-section');
  const shape = target.closest('[data-map-shape]')?.getAttribute('data-map-shape');
  if (seatId && sectionId) return { kind: 'seat', id: seatId, sectionId } as const;
  if (sectionId) return { kind: 'section', id: sectionId } as const;
  if (shape != null) return { kind: 'shape', index: Number(shape) } as const;
  return null;
}

function selectedOutline(layout: DraftLayout, selection: MapCanvasSelection) {
  if (selection?.kind === 'section')
    return layout.sections.find(({ id }) => id === selection.id)?.points ?? [];
  if (selection?.kind === 'shape') return layout.shapes[selection.index]?.points ?? [];
  return [];
}

export function PerformanceMapCanvas({
  layout,
  image,
  tool,
  selection,
  readOnly,
  disabled = false,
  resetKey,
  onSelect,
  onDraw,
  onMove,
  onResize,
}: Props) {
  const { t, i18n } = useTranslation('performances');
  const percent = useMemo(
    () => new Intl.NumberFormat(i18n.resolvedLanguage, { style: 'percent' }),
    [i18n.resolvedLanguage],
  );
  const svg = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [cameraState, setCamera] = useState(fit);
  const [panning, setPanning] = useState(false);
  const [preview, setPreview] = useState<{ gesture: Gesture; end: Point } | null>(null);
  const [draft, setDraft] = useState<{
    token: string;
    points: Point[];
    cursor?: Point;
    message?: string;
  }>({ token: '', points: [] });
  const id = useId();
  const currentTool = readOnly ? (tool === 'pan' ? 'pan' : 'select') : tool;
  const token = `${currentTool}|${resetKey ?? ''}|${layout.width}|${layout.height}`;
  const current = draft.token === token ? draft : { token, points: [] };
  const camera = restrictCamera(layout, cameraState);
  const viewport = {
    x: camera.x,
    y: camera.y,
    width: layout.width / camera.zoom,
    height: layout.height / camera.zoom,
  };
  const placing = currentTool === 'rectangle' || currentTool === 'polygon' || currentTool === 'row';
  const gesturePreview = preview && !disabled ? preview : null;
  const activeSelection = gesturePreview?.gesture.selection;
  const canResize = Boolean(onResize) && !disabled && !readOnly && currentTool === 'select';
  const outline = canResize ? selectedOutline(layout, selection) : [];
  const resizeBounds = outline.length ? polygonBounds(outline) : null;
  const step = Math.min(viewport.width, viewport.height) / 100;

  function mapPoint(clientX: number, clientY: number, matrix: DOMMatrix) {
    const { x, y } = new DOMPoint(clientX, clientY).matrixTransform(matrix);
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  }

  function mapEdge(point: Point) {
    return { x: clamp(point.x, 0, layout.width), y: clamp(point.y, 0, layout.height) };
  }

  function zoom(factor: number) {
    setCamera((previous) => zoomCamera(layout, previous, factor));
  }

  useEffect(() => {
    const target = svg.current;
    if (!target || disabled) return;
    function magnify(event: WheelEvent) {
      if ((!event.ctrlKey && !event.metaKey) || event.deltaY === 0) return;
      const transform = target?.getScreenCTM()?.inverse();
      if (!transform) return;
      event.preventDefault();
      const { x, y } = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform);
      const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
      setCamera((previous) => zoomCamera(layout, previous, factor, { x, y }));
    }
    target.addEventListener('wheel', magnify, { passive: false });
    return () => target.removeEventListener('wheel', magnify);
  }, [disabled, layout]);

  const layoutDetails = useMemo(() => {
    let seatCount = 0;
    const radii = new Map<string, number>();
    const fallback = Math.min(layout.width, layout.height) / 200;
    for (const section of layout.sections) {
      for (const row of section.rows) seatCount += row.seats.length;
      radii.set(section.id, mapSeatRadius(section.rows, mapBounds(section.points)) || fallback);
    }
    return { radii, seatCount };
  }, [layout.height, layout.sections, layout.width]);

  const visibleSeats = useMemo(() => {
    const seats = new Map<string, Array<{ seat: Seat; rowLabel: string }>>();
    const focusedSection =
      selection?.kind === 'section'
        ? selection.id
        : selection?.kind === 'seat'
          ? selection.sectionId
          : undefined;
    const largeLayout = layoutDetails.seatCount > maxVisibleSeats;
    const overview = largeLayout && camera.zoom === 1;
    const focused = focusedSection
      ? layout.sections.find(({ id }) => id === focusedSection)
      : undefined;
    const candidates = overview
      ? focused
        ? [focused]
        : []
      : largeLayout && focused
        ? [focused, ...layout.sections.filter((section) => section !== focused)]
        : layout.sections;
    let limited = overview;
    let rendered = 0;
    for (const section of candidates) {
      const result: Array<{ seat: Seat; rowLabel: string }> = [];
      const margin = layoutDetails.radii.get(section.id) ?? 0;
      for (const row of section.rows) {
        for (const seat of row.seats) {
          if (
            seat.x < viewport.x - margin ||
            seat.x > viewport.x + viewport.width + margin ||
            seat.y < viewport.y - margin ||
            seat.y > viewport.y + viewport.height + margin
          )
            continue;
          if (rendered >= maxVisibleSeats) {
            limited = true;
            break;
          }
          result.push({ seat, rowLabel: row.label });
          rendered++;
        }
        if (rendered >= maxVisibleSeats) break;
      }
      if (result.length) seats.set(section.id, result);
      if (rendered >= maxVisibleSeats) break;
    }
    if (selection?.kind === 'seat') {
      const section = layout.sections.find(({ id }) => id === selection.sectionId);
      const displayed = seats.get(selection.sectionId) ?? [];
      if (section && !displayed.some(({ seat }) => seat.id === selection.id)) {
        const row = section.rows.find((entry) => entry.seats.some(({ id }) => id === selection.id));
        const selected = row?.seats.find(({ id }) => id === selection.id);
        if (row && selected)
          seats.set(section.id, [...displayed, { seat: selected, rowLabel: row.label }]);
      }
    }
    return { seats, limited };
  }, [
    layout.sections,
    layoutDetails,
    viewport.x,
    viewport.y,
    viewport.width,
    viewport.height,
    selection,
    camera.zoom,
  ]);

  function finish(points: Point[]) {
    if (currentTool !== 'row' && !isSimpleMapPolygon(points)) {
      setDraft({ ...current, message: t('performances:mapCanvasInvalidOutline') });
      return;
    }
    setDraft({ token, points: [] });
    onDraw(points);
  }

  function place(point: Point) {
    const points = current.points;
    const newest = points[points.length - 1];
    if (newest && distance(point, newest) < step / 4) return;
    if (currentTool === 'polygon') {
      if (points.length >= 3 && distance(point, points[0]) < step * 1.1) finish(points);
      else if (points.length < 128) setDraft({ token, points: [...points, point] });
    } else if (points.length) {
      finish(currentTool === 'rectangle' ? rectanglePoints(points[0], point) : [points[0], point]);
    } else {
      setDraft({ token, points: [point] });
    }
  }

  function startPointer(event: PointerEvent<SVGSVGElement>) {
    if (disabled || gesture.current || (event.button !== 0 && event.button !== 1)) return;
    const transform = event.currentTarget.getScreenCTM()?.inverse();
    if (!transform) return;
    const point = mapPoint(event.clientX, event.clientY, transform);
    const explicitPan = currentTool === 'pan' || event.button === 1;
    const resize =
      !explicitPan &&
      resizeBounds &&
      event.target instanceof Element &&
      event.target.closest('[data-map-resize]')
        ? { x: resizeBounds.maxX, y: resizeBounds.maxY }
        : null;
    const target = resize
      ? selection
      : !explicitPan && currentTool === 'select'
        ? selectionAt(event.target)
        : null;
    const panning =
      explicitPan || (currentTool === 'select' && camera.zoom > 1 && (readOnly || !target));
    if (
      !panning &&
      !resize &&
      (point.x < 0 || point.x > layout.width || point.y < 0 || point.y > layout.height)
    )
      return;
    if (!explicitPan && currentTool === 'select') onSelect(target);
    gesture.current = {
      pointerId: event.pointerId,
      matrix: transform,
      origin: point,
      screenStart: { x: event.clientX, y: event.clientY },
      camera,
      selection: target,
      resize,
      panning,
    };
    if (panning) setPanning(true);
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function trackPointer(event: PointerEvent<SVGSVGElement>) {
    const active = gesture.current;
    if (!active || event.pointerId !== active.pointerId || disabled) return;
    const end = mapPoint(event.clientX, event.clientY, active.matrix);
    if (active.panning) {
      setCamera(
        restrictCamera(layout, {
          ...active.camera,
          x: active.camera.x + active.origin.x - end.x,
          y: active.camera.y + active.origin.y - end.y,
        }),
      );
    } else if (
      currentTool === 'rectangle' ||
      currentTool === 'row' ||
      (!readOnly && active.selection)
    ) {
      setPreview({ gesture: active, end });
    }
  }

  function completePointer(event: PointerEvent<SVGSVGElement>) {
    const active = gesture.current;
    if (!active || event.pointerId !== active.pointerId) return;
    clearPointer();
    if (disabled || active.panning) return;
    const end = mapPoint(event.clientX, event.clientY, active.matrix);
    const dragged = distance(active.screenStart, { x: event.clientX, y: event.clientY }) >= 4;
    const delta = { x: end.x - active.origin.x, y: end.y - active.origin.y };
    if (currentTool === 'select' && active.selection && dragged && !readOnly) {
      if (active.resize && onResize) commitResize(active.selection, offset(active.resize, delta));
      else commitMove(active.selection, delta);
    }
    if (!placing) return;
    const point = mapEdge(end);
    if (dragged && currentTool === 'rectangle') finish(rectanglePoints(active.origin, point));
    else if (dragged && currentTool === 'row' && distance(active.origin, point) >= step / 4)
      finish([active.origin, point]);
    else place(point);
  }

  function clearPointer() {
    gesture.current = null;
    setPanning(false);
    setPreview(null);
  }

  function commitMove(target: Item, delta: Point) {
    if (moveMapSelection(layout, target, delta) !== layout) {
      setDraft({ ...current, message: undefined });
      onMove(target, delta);
    } else if (target.kind === 'seat' || target.kind === 'section') {
      setDraft({ ...current, message: t('performances:mapCanvasMoveBlocked') });
    }
  }

  function commitResize(target: Item, corner: Point) {
    if (resizeMapSelection(layout, target, corner) !== layout) {
      setDraft({ ...current, message: undefined });
      onResize?.(target, corner);
    } else {
      setDraft({ ...current, message: t('performances:mapCanvasMoveBlocked') });
    }
  }

  function handleKey(event: KeyboardEvent<SVGSVGElement>) {
    if (disabled || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key;
    if (key === 'Escape') {
      clearPointer();
      setDraft({ token, points: [] });
      return;
    }
    if (key === '+' || key === '=') {
      event.preventDefault();
      zoom(1.5);
      return;
    }
    if (key === '-') {
      event.preventDefault();
      zoom(1 / 1.5);
      return;
    }
    const direction = directions[key];
    const center = { x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height / 2 };
    const cursor = current.cursor ?? center;
    if (direction) {
      event.preventDefault();
      const stride = step * (event.shiftKey ? 5 : 1);
      const delta = { x: direction.x * stride, y: direction.y * stride };
      if (placing) setDraft({ ...current, cursor: mapEdge(offset(cursor, delta)) });
      else if (
        canResize &&
        resizeBounds &&
        selection &&
        event.target instanceof Element &&
        event.target.hasAttribute('data-map-resize')
      ) {
        commitResize(selection, offset({ x: resizeBounds.maxX, y: resizeBounds.maxY }, delta));
      } else if (currentTool === 'select' && selection && !readOnly) commitMove(selection, delta);
      else
        setCamera(
          restrictCamera(layout, {
            ...offset(camera, { x: delta.x * 3, y: delta.y * 3 }),
            zoom: camera.zoom,
          }),
        );
    } else if (
      placing &&
      key === 'Enter' &&
      currentTool === 'polygon' &&
      current.points.length >= 3
    ) {
      event.preventDefault();
      finish(current.points);
    } else if (placing && (key === 'Enter' || key === ' ')) {
      event.preventDefault();
      place(cursor);
    }
  }

  const previewDelta = gesturePreview
    ? {
        x: gesturePreview.end.x - gesturePreview.gesture.origin.x,
        y: gesturePreview.end.y - gesturePreview.gesture.origin.y,
      }
    : zero;
  const moved = activeSelection ? clampMapMove(layout, activeSelection, previewDelta) : zero;
  const scale =
    activeSelection && gesturePreview?.gesture.resize
      ? mapResizeScale(layout, activeSelection, offset(gesturePreview.gesture.resize, previewDelta))
      : null;
  const dragTransform = scale
    ? `translate(${scale.minX} ${scale.minY}) scale(${scale.scaleX} ${scale.scaleY}) translate(${-scale.minX} ${-scale.minY})`
    : `translate(${moved.x} ${moved.y})`;
  const draftEnd = gesturePreview && placing ? mapEdge(gesturePreview.end) : null;
  const draftPoints =
    draftEnd && gesturePreview && currentTool === 'rectangle'
      ? rectanglePoints(gesturePreview.gesture.origin, draftEnd)
      : draftEnd && gesturePreview && currentTool === 'row'
        ? [gesturePreview.gesture.origin, draftEnd]
        : current.points;
  const labelSize = Math.min(layout.width, layout.height) / 28;
  const ringSize = viewport.width / 120;
  const pressToFit = () => setCamera(fit);
  const gridSize = Math.max(1, Math.min(layout.width, layout.height) / 24);
  const draftDot = viewport.width / 190;

  return (
    <div className="performance-map-canvas">
      <div className="performance-map-canvas-stage">
        <svg
          ref={svg}
          className="performance-map-canvas-viewport"
          data-layout-canvas
          viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
          tabIndex={0}
          aria-label={t('performances:mapCanvasLabel')}
          aria-describedby={id}
          data-tool={currentTool}
          data-read-only={readOnly}
          data-zoomed={camera.zoom > 1}
          data-panning={panning}
          onPointerDown={startPointer}
          onPointerMove={trackPointer}
          onPointerUp={completePointer}
          onPointerCancel={clearPointer}
          onLostPointerCapture={clearPointer}
          onKeyDown={handleKey}
        >
          <defs>
            <pattern
              id={`${id}-grid`}
              width={gridSize}
              height={gridSize}
              patternUnits="userSpaceOnUse"
            >
              <circle
                cx={gridSize / 2}
                cy={gridSize / 2}
                r={gridSize / 30}
                className="performance-map-canvas-grid-dot"
              />
            </pattern>
            <clipPath id={`${id}-view`}>
              <rect x={viewport.x} y={viewport.y} width={viewport.width} height={viewport.height} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${id}-view)`}>
            <rect width={layout.width} height={layout.height} fill={`url(#${id}-grid)`} />
            {image && (
              <image
                href={image}
                width={layout.width}
                height={layout.height}
                preserveAspectRatio="xMidYMid meet"
              />
            )}
            {layout.shapes.map((shape, index) => {
              const bounds = polygonBounds(shape.points);
              return (
                <g
                  key={index}
                  data-map-shape={index}
                  data-selected={selection?.kind === 'shape' && selection.index === index}
                  transform={
                    activeSelection?.kind === 'shape' && activeSelection.index === index
                      ? dragTransform
                      : undefined
                  }
                >
                  <polygon
                    className="performance-map-canvas-shape"
                    data-kind={shape.kind}
                    points={pointsAttribute(shape.points)}
                  >
                    <title>{shape.label}</title>
                  </polygon>
                  <text
                    className="performance-map-canvas-label"
                    x={(bounds.minX + bounds.maxX) / 2}
                    y={(bounds.minY + bounds.maxY) / 2}
                    fontSize={Math.min(
                      labelSize,
                      ((bounds.maxX - bounds.minX) / Math.max(3, shape.label.length)) * 1.5,
                    )}
                  >
                    {shape.label}
                  </text>
                </g>
              );
            })}
            {layout.sections.map((section) => {
              const bounds = polygonBounds(section.points);
              const seats = visibleSeats.seats.get(section.id) ?? [];
              const radius = layoutDetails.radii.get(section.id) ?? 1;
              const active =
                selection?.kind === 'seat'
                  ? selection.sectionId === section.id
                  : selection?.kind === 'section' && selection.id === section.id;
              return (
                <g
                  key={section.id}
                  data-map-section={section.id}
                  data-selected={active}
                  transform={
                    activeSelection?.kind === 'section' && activeSelection.id === section.id
                      ? dragTransform
                      : undefined
                  }
                >
                  <polygon
                    className="performance-map-canvas-section"
                    data-kind={section.kind}
                    points={pointsAttribute(section.points)}
                  >
                    <title>{section.label}</title>
                  </polygon>
                  {seats.map(({ seat, rowLabel }) => (
                    <circle
                      key={seat.id}
                      className="performance-map-canvas-seat"
                      data-map-seat={seat.id}
                      cx={seat.x}
                      cy={seat.y}
                      r={radius}
                      data-blocked={seat.blocked}
                      data-seat-selected={selection?.kind === 'seat' && selection.id === seat.id}
                      transform={
                        activeSelection?.kind === 'seat' && activeSelection.id === seat.id
                          ? dragTransform
                          : undefined
                      }
                    >
                      <title>{t('performances:seat', { row: rowLabel, seat: seat.label })}</title>
                    </circle>
                  ))}
                  <text
                    className="performance-map-canvas-label"
                    x={(bounds.minX + bounds.maxX) / 2}
                    y={
                      section.kind === 'ASSIGNED'
                        ? bounds.minY + labelSize
                        : (bounds.minY + bounds.maxY) / 2
                    }
                    fontSize={Math.min(
                      labelSize,
                      ((bounds.maxX - bounds.minX) / Math.max(3, section.label.length)) * 1.5,
                    )}
                  >
                    {section.label}
                  </text>
                </g>
              );
            })}
            {resizeBounds && (
              <g
                className="performance-map-canvas-selection"
                transform={activeSelection ? dragTransform : undefined}
              >
                <rect
                  x={resizeBounds.minX}
                  y={resizeBounds.minY}
                  width={resizeBounds.maxX - resizeBounds.minX}
                  height={resizeBounds.maxY - resizeBounds.minY}
                />
                <g data-map-resize tabIndex={0} aria-label={t('performances:mapCanvasResize')}>
                  <title>{t('performances:mapCanvasResize')}</title>
                  <circle
                    className="performance-map-canvas-grip-hit"
                    cx={resizeBounds.maxX}
                    cy={resizeBounds.maxY}
                    r={ringSize}
                  />
                  <circle
                    className="performance-map-canvas-grip"
                    cx={resizeBounds.maxX}
                    cy={resizeBounds.maxY}
                    r={ringSize}
                  />
                </g>
              </g>
            )}
            {draftPoints.length > 0 && (
              <g className="performance-map-canvas-draft">
                {currentTool === 'rectangle' && draftPoints.length === 4 ? (
                  <polygon points={pointsAttribute(draftPoints)} />
                ) : (
                  <polyline points={pointsAttribute(draftPoints)} />
                )}
                {draftPoints.map(({ x, y }, index) => (
                  <circle key={index} cx={x} cy={y} r={draftDot} />
                ))}
              </g>
            )}
            {current.cursor && placing && (
              <circle
                className="performance-map-canvas-cursor"
                cx={current.cursor.x}
                cy={current.cursor.y}
                r={ringSize}
              />
            )}
          </g>
        </svg>
      </div>
      <div className="performance-map-canvas-footer">
        <p id={id}>
          {t(
            readOnly && currentTool === 'select'
              ? 'performances:mapCanvasReadOnlyHelp'
              : instructions[currentTool],
          )}
          {placing && (
            <span className="performance-map-canvas-sr">
              {' '}
              {t('performances:mapCanvasKeyboardDraw')}
            </span>
          )}
        </p>
        <div className="performance-map-canvas-controls">
          {placing && current.points.length > 0 && (
            <>
              {currentTool === 'polygon' && (
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={disabled || current.points.length < 3}
                  onClick={() => finish(current.points)}
                >
                  {t('performances:mapCanvasFinishOutline')}
                </button>
              )}
              <button
                type="button"
                className="button button-secondary"
                disabled={disabled}
                onClick={() => setDraft({ token, points: [] })}
              >
                {t('performances:mapCanvasCancelDrawing')}
              </button>
            </>
          )}
          <div
            className="performance-map-canvas-zoom"
            role="group"
            aria-label={t('performances:mapCanvasZoom')}
          >
            <button
              type="button"
              className="button button-secondary"
              disabled={disabled || camera.zoom <= 1}
              aria-label={t('performances:mapZoomOut')}
              title={t('performances:mapZoomOut')}
              onClick={() => zoom(1 / 1.5)}
            >
              <Minus size={16} />
            </button>
            <span>{percent.format(camera.zoom)}</span>
            <button
              type="button"
              className="button button-secondary"
              disabled={disabled || camera.zoom >= maxZoom}
              aria-label={t('performances:mapZoomIn')}
              title={t('performances:mapZoomIn')}
              onClick={() => zoom(1.5)}
            >
              <Plus size={16} />
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={disabled || camera.zoom <= 1}
              aria-label={t('performances:mapZoomFit')}
              title={t('performances:mapZoomFit')}
              onClick={pressToFit}
            >
              <Maximize2 size={16} />
            </button>
          </div>
        </div>
      </div>
      {visibleSeats.limited && (
        <p className="performance-map-canvas-note">{t('performances:mapCanvasSeatLimit')}</p>
      )}
      {current.message && (
        <p className="performance-map-canvas-error" role="alert">
          {current.message}
        </p>
      )}
    </div>
  );
}
