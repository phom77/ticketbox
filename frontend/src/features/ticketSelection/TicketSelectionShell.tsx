import { useState, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PurchaseProgress } from '../../components/purchase/PurchaseProgress';
import './TicketSelection.css';

/** The shared frame of the unified Choose tickets page. */
export function TicketSelectionShell({
  title,
  subtitle,
  backLabel,
  onBack,
  backDisabled,
  filters,
  map,
  list,
  summary,
  banner,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  backLabel: string;
  onBack: () => void;
  backDisabled?: boolean;
  filters: ReactNode;
  map: ReactNode;
  list: ReactNode;
  summary: ReactNode;
  banner?: ReactNode;
}) {
  const { t } = useTranslation('customer');
  const [tab, setTab] = useState<'map' | 'list'>('map');
  return (
    <div className="buyer-page purchase-page page-width ts-page" data-tab={tab}>
      <header className="purchase-header ts-header">
        <button className="back-link" type="button" disabled={backDisabled} onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" />
          {backLabel}
        </button>
        <PurchaseProgress current="tickets" />
        <h1>{title}</h1>
        {subtitle ? <p className="ts-subtitle">{subtitle}</p> : null}
      </header>
      {banner}
      {filters}
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
