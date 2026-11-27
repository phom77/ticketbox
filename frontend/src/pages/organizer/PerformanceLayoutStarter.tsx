import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DraftLayout, LayoutTemplate } from '../../api/performanceManagement';
import {
  buildStarter,
  starterDefaults,
  starterIds,
  StarterSizeError,
  type StarterId,
  type StarterSizes,
} from '../../features/performance/starterLayouts';
import { numberFormatter } from '../../data/formatters';

const count = numberFormatter({ maximumFractionDigits: 0 });

/** Guided start for a performance that needs a map and has none yet. */
export function PerformanceLayoutStarter({
  templates,
  disabled,
  onTemplate,
  onStarter,
  onBlank,
  onAdmission,
}: {
  templates: LayoutTemplate[];
  disabled: boolean;
  onTemplate: (template: LayoutTemplate) => void;
  onStarter: (layout: DraftLayout, summary: { seats: number; standingCapacity: number }) => void;
  onBlank: () => void;
  onAdmission?: () => void;
}) {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<StarterId | null>(null);
  return (
    <section className="layout-starter" aria-labelledby="layout-starter-title">
      <h4 id="layout-starter-title">{t('performance-layout:starterTitle')}</h4>
      <p>{t('performance-layout:starterHelp')}</p>
      {templates.length > 0 && (
        <div>
          <h5>{t('performance-layout:starterTemplates')}</h5>
          <ul className="layout-starter-list">
            {templates.map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={disabled}
                  onClick={() => onTemplate(template)}
                >
                  {template.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <h5>{t('performance-layout:starterShapes')}</h5>
      <ul className="layout-starter-list">
        {starterIds.map((id) => (
          <li key={id}>
            <button
              type="button"
              className="button button-secondary"
              aria-pressed={chosen === id}
              disabled={disabled}
              onClick={() => setChosen(chosen === id ? null : id)}
            >
              <StarterPreview id={id} />
              <span>
                <strong>{t(`performance-layout:starter_${id}`)}</strong>
                <small>{t(`performance-layout:starterHelp_${id}`)}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {chosen && (
        <StarterForm
          key={chosen}
          id={chosen}
          disabled={disabled}
          onUse={(layout, summary) => onStarter(layout, summary)}
        />
      )}
      <p>{t('performance-layout:starterGeneric')}</p>
      <div className="performance-options">
        {onAdmission && (
          <button
            type="button"
            className="button button-secondary"
            disabled={disabled}
            onClick={onAdmission}
          >
            {t('performance-layout:starterAdmission')}
          </button>
        )}
        <button
          type="button"
          className="button button-secondary"
          disabled={disabled}
          onClick={onBlank}
        >
          {t('performance-layout:starterBlank')}
        </button>
      </div>
    </section>
  );
}

function useLabels() {
  const { t } = useTranslation();
  return {
    stage: t('performance-layout:stage'),
    floor: t('performance-layout:starterFloor'),
    stalls: t('performance-layout:starterStalls'),
    leftStand: t('performance-layout:starterLeftStand'),
    rightStand: t('performance-layout:starterRightStand'),
    northStand: t('performance-layout:starterNorthStand'),
    southStand: t('performance-layout:starterSouthStand'),
    westStand: t('performance-layout:starterWestStand'),
    eastStand: t('performance-layout:starterEastStand'),
  };
}

function StarterPreview({ id }: { id: StarterId }) {
  const labels = useLabels();
  const { layout } = useMemo(
    () => buildStarter(id, starterDefaults[id], labels),
    // The labels only name sections; they do not change the shapes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  );
  const points = (polygon: { x: number; y: number }[]) =>
    polygon.map(({ x, y }) => `${x},${y}`).join(' ');
  return (
    <svg
      className="layout-starter-preview"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      aria-hidden="true"
      focusable="false"
    >
      {layout.shapes.map((shape, index) => (
        <polygon key={index} points={points(shape.points)} className="is-stage" />
      ))}
      {layout.sections.map((section) => (
        <polygon
          key={section.id}
          points={points(section.points)}
          className={section.kind === 'GA' ? 'is-standing' : 'is-seated'}
        />
      ))}
    </svg>
  );
}

const sizeFields: Record<StarterId, (keyof StarterSizes)[]> = {
  standingAndStands: ['floorCapacity', 'rows', 'seatsPerRow'],
  theatre: ['rows', 'seatsPerRow', 'aisle'],
  arena: ['floorCapacity', 'stands', 'rows', 'seatsPerRow'],
};

function StarterForm({
  id,
  disabled,
  onUse,
}: {
  id: StarterId;
  disabled: boolean;
  onUse: (layout: DraftLayout, summary: { seats: number; standingCapacity: number }) => void;
}) {
  const { t } = useTranslation();
  const labels = useLabels();
  const [sizes, setSizes] = useState<StarterSizes>(starterDefaults[id]);
  const result = useMemo(() => {
    try {
      return { built: buildStarter(id, sizes, labels) };
    } catch (failure) {
      if (failure instanceof StarterSizeError) return { error: failure };
      throw failure;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, sizes]);
  const error = 'error' in result ? result.error : undefined;
  return (
    <form
      className="layout-starter-form performance-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (result.built) {
          onUse(result.built.layout, {
            seats: result.built.seats,
            standingCapacity: result.built.standingCapacity,
          });
        }
      }}
    >
      {sizeFields[id].map((field) =>
        field === 'aisle' ? (
          <label key={field} className="performance-inline">
            <input
              type="checkbox"
              checked={sizes.aisle}
              onChange={(event) => setSizes({ ...sizes, aisle: event.target.checked })}
            />
            {t('performance-layout:starterSize_aisle')}
          </label>
        ) : (
          <label key={field}>
            {t(`performance-layout:starterSize_${field}`)}
            <input
              type="number"
              min={1}
              step={1}
              value={sizes[field] as number}
              aria-invalid={error?.field === field || undefined}
              onChange={(event) => setSizes({ ...sizes, [field]: Number(event.target.value) })}
            />
          </label>
        ),
      )}
      <p role={error ? 'alert' : 'status'} className="performance-wide">
        {error
          ? t(
              error.field === 'seatTotal'
                ? 'performance-layout:starterSeatLimit'
                : 'performance-layout:starterBadSize',
              {
                limit: count.format(error.limit ?? 0),
                size: t(`performance-layout:starterSize_${error.field}`, { defaultValue: '' }),
              },
            )
          : t('performance-layout:starterTotals', {
              seats: count.format(result.built!.seats),
              standing: count.format(result.built!.standingCapacity),
            })}
      </p>
      <div className="performance-wide performance-options">
        <button className="button button-primary" disabled={disabled || Boolean(error)}>
          {t('performance-layout:starterUse')}
        </button>
      </div>
    </form>
  );
}
