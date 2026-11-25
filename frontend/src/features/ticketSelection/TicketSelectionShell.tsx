import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PurchaseProgress } from '../../components/purchase/PurchaseProgress';
import './TicketSelection.css';

/** The shared frame of the unified Choose tickets page. */
export function TicketSelectionShell({
  eventTitle,
  subtitle,
  backLabel,
  onBack,
  backDisabled,
  toolbar,
  map,
  list,
  summary,
  banner,
  defaultTab = 'map',
}: {
  eventTitle: ReactNode;
  subtitle?: ReactNode;
  backLabel: string;
  onBack: () => void;
  backDisabled?: boolean;
  toolbar?: ReactNode;
  map: ReactNode;
  list: ReactNode;
  summary: ReactNode;
  banner?: ReactNode;
  defaultTab?: 'map' | 'list';
}) {
  const { t } = useTranslation('customer');
  const [chosenTab, setTab] = useState<'map' | 'list' | null>(null);
  const tab = chosenTab ?? defaultTab;
  const page = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLElement>(null);

  // The map pane sticks just below the sticky context bar, whatever its height.
  useLayoutEffect(() => {
    const element = bar.current;
    if (!element) return;
    const publish = () =>
      page.current?.style.setProperty('--ts-bar-height', `${element.offsetHeight}px`);
    publish();
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="buyer-page purchase-page page-width ts-page" data-tab={tab} ref={page}>
      <header className="ts-bar" ref={bar}>
        <div className="ts-bar-context">
          <button className="back-link" type="button" disabled={backDisabled} onClick={onBack}>
            <ArrowLeft size={18} aria-hidden="true" />
            {backLabel}
          </button>
          <div className="ts-bar-event">
            <p className="ts-event-title">{eventTitle}</p>
            {subtitle ? <p className="ts-subtitle">{subtitle}</p> : null}
          </div>
        </div>
        <PurchaseProgress current="tickets" />
      </header>
      <h1 className="ts-title">{t('customer:ticketSelection_title')}</h1>
      {banner}
      {toolbar}
      <div className="ts-tabs" role="tablist" aria-label={t('customer:ticketSelection_views')}>
        {(['map', 'list'] as const).map((name) => (
          <button
            key={name}
            id={'ts-tab-' + name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            aria-controls={'ts-panel-' + name}
            onClick={() => setTab(name)}
          >
            {t(name === 'map' ? 'ticketSelection_tabMap' : 'ticketSelection_tabList')}
          </button>
        ))}
      </div>
      <div className="ts-layout">
        <section
          id="ts-panel-map"
          className="ts-pane ts-map-pane purchase-panel"
          aria-label={t('customer:ticketSelection_tabMap')}
        >
          {map}
        </section>
        <section
          id="ts-panel-list"
          className="ts-pane ts-list-pane purchase-panel"
          aria-label={t('customer:ticketSelection_tabList')}
        >
          {list}
        </section>
        {summary}
      </div>
    </div>
  );
}
