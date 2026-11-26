import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { numberFormatter } from '../../data/formatters';

export type TrendPoint = {
  key: string;
  /** Short axis label. */
  axis: string;
  /** Full label announced for the point. */
  label: string;
  tickets: number;
  /** Absent without the finance grant. */
  revenue?: number;
};

type Series = 'tickets' | 'revenue';

const integer = numberFormatter();
const money = numberFormatter({ style: 'currency', currency: 'VND', maximumFractionDigits: 0 });
const compact = numberFormatter({ notation: 'compact', maximumFractionDigits: 1 });

const width = 800;
const height = 280;
const padding = { top: 24, right: 24, bottom: 42, left: 72 };
const chartWidth = width - padding.left - padding.right;
const chartHeight = height - padding.top - padding.bottom;

/**
 * Line chart of tickets or revenue over time. Points are keyboard focusable and the live summary follows the active
 * point. The revenue series is offered only when the data carries revenue.
 */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const { t } = useTranslation();
  const id = useId();
  const hasRevenue = points.length > 0 && points.every((point) => point.revenue !== undefined);
  const [series, setSeries] = useState<Series>('tickets');
  const [activeIndex, setActiveIndex] = useState(Math.max(0, points.length - 1));
  useEffect(() => setActiveIndex(Math.max(0, points.length - 1)), [points]);
  const mode: Series = hasRevenue ? series : 'tickets';
  const value = (point: TrendPoint) => (mode === 'revenue' ? (point.revenue ?? 0) : point.tickets);
  const format = (amount: number) =>
    mode === 'revenue' ? money.format(amount) : integer.format(amount);

  if (!points.length)
    return (
      <div className="revenue-chart-empty">
        <p>{t('operations-reports:salesEmpty')}</p>
      </div>
    );

  const max = Math.max(1, ...points.map(value));
  const placed = points.map((point, index) => ({
    point,
    x:
      padding.left +
      (points.length === 1 ? chartWidth / 2 : (index * chartWidth) / (points.length - 1)),
    y: padding.top + chartHeight - (value(point) / max) * chartHeight,
  }));
  const path = placed
    .map((item, index) => `${index ? 'L' : 'M'} ${item.x.toFixed(2)} ${item.y.toFixed(2)}`)
    .join(' ');
  const active = placed[Math.min(activeIndex, placed.length - 1)];
  const labelled = [0, Math.floor((placed.length - 1) / 2), placed.length - 1].filter(
    (index, position, all) => all.indexOf(index) === position,
  );

  return (
    <div className="revenue-chart-panel">
      {hasRevenue && (
        <div
          className="sales-series-switch"
          role="group"
          aria-label={t('operations-reports:salesSeries')}
        >
          {(['tickets', 'revenue'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              className={mode === option ? 'is-active' : undefined}
              onClick={() => setSeries(option)}
            >
              {t(`operations-reports:salesSeries_${option}`)}
            </button>
          ))}
        </div>
      )}
      <div className="revenue-chart-summary" aria-live="polite">
        <span>{active.point.label}</span>
        <strong>{format(value(active.point))}</strong>
      </div>
      <div className="revenue-chart-scroll">
        <svg
          className="revenue-chart"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-labelledby={`${id}-title ${id}-desc`}
        >
          <title id={`${id}-title`}>{t('operations-reports:salesChartTitle')}</title>
          <desc id={`${id}-desc`}>{t(`operations-reports:salesChartDescription_${mode}`)}</desc>
          {[0, 0.5, 1].map((ratio) => {
            const y = padding.top + chartHeight - ratio * chartHeight;
            return (
              <g key={ratio}>
                <line
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={y}
                  y2={y}
                  className="revenue-grid-line"
                />
                <text
                  x={padding.left - 12}
                  y={y + 4}
                  textAnchor="end"
                  className="revenue-axis-label"
                >
                  {compact.format(max * ratio)}
                </text>
              </g>
            );
          })}
          <path d={path} className="revenue-line" />
          {placed.map((item, index) => (
            <circle
              key={item.point.key}
              cx={item.x}
              cy={item.y}
              r={index === activeIndex ? 6 : 4}
              className={index === activeIndex ? 'revenue-point is-active' : 'revenue-point'}
              tabIndex={0}
              role="img"
              aria-label={`${item.point.label}: ${format(value(item.point))}`}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
            />
          ))}
          {labelled.map((index) => (
            <text
              key={placed[index].point.key}
              x={placed[index].x}
              y={height - 13}
              textAnchor={index === 0 ? 'start' : index === placed.length - 1 ? 'end' : 'middle'}
              className="revenue-axis-label"
            >
              {placed[index].point.axis}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}
