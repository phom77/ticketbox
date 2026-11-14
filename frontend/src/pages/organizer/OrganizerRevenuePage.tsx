import { dateFormatter, numberFormatter } from '../../data/formatters';
import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, RefreshCw, TrendingUp } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { isRequestCanceled } from '../../api/client';
import {
  exportRevenueReport,
  getOrganizerRevenueConcerts,
  getRevenueSummary,
  getSalesTrend,
  getZoneRevenue,
  type OrganizerConcert,
  type RevenueSummary,
  type SalesTrend,
  type ZoneRevenue,
} from '../../api/organizerRevenue';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { ConcertPicker } from '../../components/admin/ConcertPicker';
import { useToast } from '../../components/feedback/toast-context';

const REPORTING_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const currency = numberFormatter({
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});
const integer = numberFormatter();
const displayDate = dateFormatter({
  dateStyle: 'medium',
  timeZone: REPORTING_TIME_ZONE,
});

export function OrganizerRevenuePage() {
  useTranslation();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [concerts, setConcerts] = useState<OrganizerConcert[]>([]);
  const [loadingConcerts, setLoadingConcerts] = useState(true);
  const [concertsError, setConcertsError] = useState('');
  const [summary, setSummary] = useState<RevenueSummary | null>(null);
  const [zones, setZones] = useState<ZoneRevenue[]>([]);
  const [trend, setTrend] = useState<SalesTrend[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [dateError, setDateError] = useState('');
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);

  const selectedConcertId = searchParams.get('concertId') ?? '';
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const selectedConcert = useMemo(
    () => concerts.find((concert) => concert.id === selectedConcertId) ?? null,
    [concerts, selectedConcertId],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoadingConcerts(true);
    setConcertsError('');
    getOrganizerRevenueConcerts(controller.signal)
      .then((page) => setConcerts(page.content))
      .catch((requestError: unknown) => {
        if (!isRequestCanceled(requestError)) {
          setConcertsError(
            requestError instanceof Error
              ? requestError.message
              : translate("organizer:organizerRevenuePage_khongTheTaiDanhSachConcertDa"),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingConcerts(false);
      });
    return () => controller.abort();
  }, [reloadKey]);

  useEffect(() => {
    if (!concerts.length) return;
    const concert = concerts.find((item) => item.id === selectedConcertId) ?? concerts[0];
    const defaults = defaultRange(concert.eventDate);
    const validRange = isValidDate(from) && isValidDate(to) && from <= to;
    const nextFrom = validRange ? from : defaults.from;
    const nextTo = validRange ? to : defaults.to;
    if (concert.id !== selectedConcertId || from !== nextFrom || to !== nextTo) {
      setSearchParams({ concertId: concert.id, from: nextFrom, to: nextTo }, { replace: true });
    }
  }, [concerts, from, selectedConcertId, setSearchParams, to]);

  useEffect(() => {
    setDraftFrom(from);
    setDraftTo(to);
    setDateError('');
  }, [from, to]);

  useEffect(() => {
    if (!selectedConcert || !isValidDate(from) || !isValidDate(to) || from > to) return;
    const controller = new AbortController();
    setLoadingReport(true);
    setReportError('');
    Promise.all([
      getRevenueSummary(selectedConcert.id, controller.signal),
      getZoneRevenue(selectedConcert.id, controller.signal),
      getSalesTrend(selectedConcert.id, from, to, controller.signal),
    ])
      .then(([nextSummary, nextZones, nextTrend]) => {
        setSummary(nextSummary);
        setZones(nextZones);
        setTrend(nextTrend);
      })
      .catch((requestError: unknown) => {
        if (!isRequestCanceled(requestError)) {
          setSummary(null);
          setZones([]);
          setTrend([]);
          setReportError(
            requestError instanceof Error
              ? requestError.message
              : translate("organizer:organizerRevenuePage_khongTheTaiBaoCaoDoanhThu"),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingReport(false);
      });
    return () => controller.abort();
  }, [from, reloadKey, selectedConcert, to]);

  function chooseConcert(concertId: string) {
    const concert = concerts.find((item) => item.id === concertId);
    if (!concert) return;
    const range = defaultRange(concert.eventDate);
    setSearchParams({ concertId, from: range.from, to: range.to });
  }

  function applyDateRange(event: React.FormEvent) {
    event.preventDefault();
    if (!isValidDate(draftFrom) || !isValidDate(draftTo)) {
      setDateError(translate("organizer:organizerRevenuePage_chonDayDuNgayBatDauVa"));
      return;
    }
    if (draftFrom > draftTo) {
      setDateError(translate("organizer:organizerRevenuePage_ngayBatDauPhaiTruocHoacBang"));
      return;
    }
    setDateError('');
    setSearchParams({ concertId: selectedConcertId, from: draftFrom, to: draftTo });
  }

  async function download(format: 'csv' | 'pdf') {
    if (!selectedConcert) return;
    setExporting(format);
    try {
      const blob = await exportRevenueReport(selectedConcert.id, format);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${fileSlug(selectedConcert.title)}-revenue-report.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : translate("organizer:organizerRevenuePage_khongTheTaiBaoCao"));
    } finally {
      setExporting(null);
    }
  }

  if (loadingConcerts) return <RevenuePageSkeleton />;

  if (concertsError) {
    return (
      <div className="state-panel organizer-revenue-state" role="alert">
        <TrendingUp aria-hidden="true" size={30} />
        <h3>{translate("organizer:organizerRevenuePage_chuaTheMoBaoCao")}</h3>
        <p>{concertsError}</p>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => setReloadKey((value) => value + 1)}
        >
          {translate("organizer:organizerRevenuePage_thuLai")}
        </button>
      </div>
    );
  }

  if (!concerts.length) {
    return (
      <div className="state-panel organizer-revenue-state">
        <TrendingUp aria-hidden="true" size={30} />
        <h3>{translate("organizer:organizerRevenuePage_chuaCoConcertHoanThanh")}</h3>
        <p>{translate("organizer:organizerRevenuePage_baoCaoDoanhThuChiKhaDung")}</p>
        <Link className="button button-secondary" to="/organizer/concerts">
          {translate("organizer:organizerRevenuePage_quanLyConcert")}
        </Link>
      </div>
    );
  }

  return (
    <>
      <AdminPageHeader
        eyebrow={translate("organizer:organizerRevenuePage_phanTichDoanhThu")}
        title={translate("organizer:organizerRevenuePage_baoCaoDoanhThu")}
        description={translate("organizer:organizerRevenuePage_theoDoiKetQuaBanVeHieu")}
        actions={
          <div className="revenue-export-actions">
            <button
              className="admin-secondary-action"
              type="button"
              disabled={!summary || exporting !== null}
              onClick={() => void download('csv')}
            >
              <FileSpreadsheet aria-hidden="true" size={16} />
              {exporting === 'csv' ? translate("organizer:organizerRevenuePage_dangXuat") : translate("organizer:organizerRevenuePage_xuatCsv")}
            </button>
            <button
              className="admin-primary-action"
              type="button"
              disabled={!summary || exporting !== null}
              onClick={() => void download('pdf')}
            >
              <Download aria-hidden="true" size={16} />
              {exporting === 'pdf' ? translate("organizer:organizerRevenuePage_dangXuat") : translate("organizer:organizerRevenuePage_xuatPdf")}
            </button>
          </div>
        }
      />

      <section className="revenue-filter-panel" aria-label={translate("organizer:organizerRevenuePage_boLocBaoCao")}>
        <ConcertPicker
          concerts={concerts}
          value={selectedConcertId}
          onChange={chooseConcert}
          label={translate("organizer:organizerRevenuePage_concertDaHoanThanh")}
          placeholder={translate("organizer:organizerRevenuePage_chonConcertDeXemBaoCao")}
        />
        <form className="revenue-date-form" onSubmit={applyDateRange}>
          <label className="admin-field">
            <span>{translate("organizer:organizerRevenuePage_tuNgay")}</span>
            <input
              type="date"
              value={draftFrom}
              onChange={(event) => setDraftFrom(event.target.value)}
            />
          </label>
          <label className="admin-field">
            <span>{translate("organizer:organizerRevenuePage_denNgay")}</span>
            <input
              type="date"
              value={draftTo}
              onChange={(event) => setDraftTo(event.target.value)}
            />
          </label>
          <button
            className="admin-secondary-action"
            type="submit"
            disabled={!draftFrom || !draftTo || loadingReport}
          >
            {translate("organizer:organizerRevenuePage_apDung")}
          </button>
        </form>
        {dateError ? (
          <p className="revenue-date-error" role="alert">
            {dateError}
          </p>
        ) : null}
        {selectedConcert ? (
          <p className="revenue-concert-date">
            {translate("organizer:organizerRevenuePage_demDien")} <strong>{displayDate.format(new Date(selectedConcert.eventDate))}</strong>
          </p>
        ) : null}
      </section>

      {reportError ? (
        <div className="state-panel organizer-revenue-state" role="alert">
          <TrendingUp aria-hidden="true" size={30} />
          <h3>{translate("organizer:organizerRevenuePage_khongTheTaiDuLieuDoanhThu")}</h3>
          <p>{reportError}</p>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            <RefreshCw size={16} /> {translate("organizer:organizerRevenuePage_thuLai")}
          </button>
        </div>
      ) : loadingReport || !summary ? (
        <ReportSkeleton />
      ) : (
        <RevenueReport summary={summary} zones={zones} trend={trend} />
      )}
    </>
  );
}

function RevenueReport({
  summary,
  zones,
  trend,
}: {
  summary: RevenueSummary;
  zones: ZoneRevenue[];
  trend: SalesTrend[];
}) {
  useTranslation();
  const remaining = Math.max(0, summary.totalTicketsAvailable - summary.totalTicketsSold);
  return (
    <>
      <section className="revenue-summary-grid" aria-label={translate("organizer:organizerRevenuePage_tongQuanDoanhThu")}>
        <RevenueMetric
          label={translate("organizer:organizerRevenuePage_tongDoanhThu")}
          value={currency.format(summary.totalRevenue)}
          emphasis
        />
        <RevenueMetric
          label={translate("organizer:organizerRevenuePage_veDaBan")}
          value={integer.format(summary.totalTicketsSold)}
          note={translate("organizer:organizerRevenuePage_sucChua", { arg1: formatPercent(summary.soldRate) })}
        />
        <RevenueMetric
          label={translate("organizer:organizerRevenuePage_tongSucChua")}
          value={integer.format(summary.totalTicketsAvailable)}
        />
        <RevenueMetric label={translate("organizer:organizerRevenuePage_veConLai")} value={integer.format(remaining)} />
      </section>

      <section className="revenue-section">
        <div className="revenue-section-heading">
          <div>
            <span>{translate("organizer:organizerRevenuePage_salesTimeline")}</span>
            <h2>{translate("organizer:organizerRevenuePage_doanhThuTheoNgay")}</h2>
          </div>
          <p>{trend.length} {translate("organizer:organizerRevenuePage_ngayTrongKhoangDaChon")}</p>
        </div>
        <RevenueTrendChart data={trend} />
      </section>

      <section className="revenue-section">
        <div className="revenue-section-heading">
          <div>
            <span>{translate("organizer:organizerRevenuePage_ticketZones")}</span>
            <h2>{translate("organizer:organizerRevenuePage_hieuSuatTheoHangVe")}</h2>
          </div>
          <p>{zones.length} {translate("organizer:organizerRevenuePage_hangVe")}</p>
        </div>
        <div className="admin-data-panel">
          {zones.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table revenue-zone-table">
                <thead>
                  <tr>
                    <th>{translate("organizer:organizerRevenuePage_hangVe_2")}</th>
                    <th>{translate("organizer:organizerRevenuePage_gia")}</th>
                    <th>{translate("organizer:organizerRevenuePage_daBan")}</th>
                    <th>{translate("organizer:organizerRevenuePage_conLai")}</th>
                    <th>{translate("organizer:organizerRevenuePage_tong")}</th>
                    <th>{translate("organizer:organizerRevenuePage_tyLe")}</th>
                    <th>{translate('revenue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {zones.map((zone) => (
                    <tr key={zone.zoneName}>
                      <td>
                        <strong className="admin-table-primary">{zone.zoneName}</strong>
                      </td>
                      <td>{currency.format(zone.price)}</td>
                      <td>{integer.format(zone.soldQuantity)}</td>
                      <td>{integer.format(zone.availableQuantity)}</td>
                      <td>{integer.format(zone.totalQuantity)}</td>
                      <td>
                        <strong className="revenue-rate">{formatPercent(zone.soldRate)}</strong>
                      </td>
                      <td>
                        <strong className="admin-table-primary">
                          {currency.format(zone.revenue)}
                        </strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="admin-empty-state">
              <TrendingUp aria-hidden="true" size={28} />
              <h2>{translate("organizer:organizerRevenuePage_chuaCoHangVe")}</h2>
              <p>{translate("organizer:organizerRevenuePage_concertNayChuaCoDuLieuHang")}</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function RevenueMetric({
  label,
  value,
  note,
  emphasis = false,
}: {
  label: string;
  value: string;
  note?: string;
  emphasis?: boolean;
}) {
  useTranslation();
  return (
    <div className={emphasis ? 'is-emphasis' : ''}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

function RevenueTrendChart({ data }: { data: SalesTrend[] }) {
  useTranslation();
  const [activeIndex, setActiveIndex] = useState(Math.max(0, data.length - 1));
  useEffect(() => setActiveIndex(Math.max(0, data.length - 1)), [data]);
  const width = 800;
  const height = 280;
  const padding = { top: 24, right: 24, bottom: 42, left: 72 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxRevenue = Math.max(1, ...data.map((item) => item.revenue));
  const points = data.map((item, index) => ({
    ...item,
    x:
      padding.left +
      (data.length === 1 ? chartWidth / 2 : (index * chartWidth) / (data.length - 1)),
    y: padding.top + chartHeight - (item.revenue / maxRevenue) * chartHeight,
  }));
  const path = points
    .map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
  const active = points[Math.min(activeIndex, Math.max(0, points.length - 1))];

  if (!data.length)
    return (
      <div className="revenue-chart-empty">
        <p>{translate("organizer:organizerRevenuePage_khongCoDuLieuTrongKhoangNgay")}</p>
      </div>
    );

  return (
    <div className="revenue-chart-panel">
      <div className="revenue-chart-summary" aria-live="polite">
        <span>{active ? formatDateOnly(active.date) : ''}</span>
        <strong>{active ? currency.format(active.revenue) : currency.format(0)}</strong>
        <small>{active ? translate("organizer:organizerRevenuePage_veDaBan_2", {
          count: active.ticketsSold, formattedCount: integer.format(active.ticketsSold),
        }) : ''}</small>
      </div>
      <div className="revenue-chart-scroll">
        <svg
          className="revenue-chart"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-labelledby="revenue-chart-title revenue-chart-description"
        >
          <title id="revenue-chart-title">{translate("organizer:organizerRevenuePage_bieuDoDoanhThuTheoNgay")}</title>
          <desc id="revenue-chart-description">
            {translate("organizer:organizerRevenuePage_doanhThuVaSoVeDaBan")}
          </desc>
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
                  {compactCurrency(maxRevenue * ratio)}
                </text>
              </g>
            );
          })}
          {path ? <path d={path} className="revenue-line" /> : null}
          {points.map((point, index) => (
            <circle
              key={point.date}
              cx={point.x}
              cy={point.y}
              r={index === activeIndex ? 6 : 4}
              className={index === activeIndex ? 'revenue-point is-active' : 'revenue-point'}
              tabIndex={0}
              role="img"
              aria-label={translate("organizer:organizerRevenuePage_ve", { arg1: formatDateOnly(point.date), arg2: currency.format(point.revenue), arg3: point.ticketsSold })}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
            />
          ))}
          {[0, Math.floor((points.length - 1) / 2), points.length - 1]
            .filter((value, index, values) => values.indexOf(value) === index)
            .map((index) => (
              <text
                key={points[index].date}
                x={points[index].x}
                y={height - 13}
                textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
                className="revenue-axis-label"
              >
                {shortDate(points[index].date)}
              </text>
            ))}
        </svg>
      </div>
    </div>
  );
}

function RevenuePageSkeleton() {
  useTranslation();
  return (
    <div className="revenue-page-skeleton" aria-label={translate("organizer:organizerRevenuePage_dangTaiBaoCao")} aria-live="polite">
      <span />
      <span />
      <span />
    </div>
  );
}

function ReportSkeleton() {
  useTranslation();
  return (
    <div
      className="revenue-report-skeleton"
      aria-label={translate("organizer:organizerRevenuePage_dangTaiDuLieuDoanhThu")}
      aria-live="polite"
    >
      <div>
        {[1, 2, 3, 4].map((item) => (
          <span key={item} />
        ))}
      </div>
      <span />
      <span />
    </div>
  );
}

function defaultRange(eventDate: string) {
  const to = dateInReportingZone(eventDate);
  const start = new Date(`${to}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 29);
  return { from: start.toISOString().slice(0, 10), to };
}

function dateInReportingZone(value: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORTING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (type: 'year' | 'month' | 'day') =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function isValidDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function formatPercent(value: number) {
  return `${numberFormatter({ maximumFractionDigits: 1 }).format(value)}%`;
}

function formatDateOnly(value: string) {
  return dateFormatter({ dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

function shortDate(value: string) {
  return dateFormatter({
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

function compactCurrency(value: number) {
  return numberFormatter({ notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

function fileSlug(value: string) {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'concert'
  );
}
