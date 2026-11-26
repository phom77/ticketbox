import { dateFormatter, numberFormatter } from '../../data/formatters';
import type { SalesGrouping, SalesTrendBucket } from '../../api/sales';
import type { TrendPoint } from './TrendChart';

export const integer = numberFormatter();
export const money = numberFormatter({
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});
const percent = numberFormatter({ maximumFractionDigits: 1 });

export function formatPercent(value: number) {
  return `${percent.format(value)}%`;
}

const day = dateFormatter({ dateStyle: 'medium', timeZone: 'UTC' });
const hour = dateFormatter({ dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
const axisDay = dateFormatter({ day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const axisHour = dateFormatter({ hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

/** Bucket starts are wall-clock times in the report's timezone, so they are formatted without conversion. */
function asWallClock(start: string) {
  return new Date(`${start.slice(0, 19)}Z`);
}

export function bucketPoints(buckets: SalesTrendBucket[], groupBy: SalesGrouping): TrendPoint[] {
  return buckets.map((bucket) => {
    const at = asWallClock(bucket.start);
    return {
      key: bucket.start,
      axis: groupBy === 'hour' ? axisHour.format(at) : axisDay.format(at),
      label: groupBy === 'hour' ? hour.format(at) : day.format(at),
      tickets: bucket.netTickets,
      revenue: bucket.netSales,
    };
  });
}
