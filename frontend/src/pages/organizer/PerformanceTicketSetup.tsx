import { Armchair, ArrowRight, Layers3, LayoutGrid, Ticket } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { sellingModelLabels, sellingModels, type SellingModel } from './performanceSetup';

const modelDetails = {
  admission: { icon: Ticket, description: 'performances:sellingModelAdmissionHelp' },
  zones: { icon: Layers3, description: 'performances:sellingModelZonesHelp' },
  reserved: { icon: Armchair, description: 'performances:sellingModelReservedHelp' },
  mixed: { icon: LayoutGrid, description: 'performances:sellingModelMixedHelp' },
};

export function PerformanceTicketSetup({
  disabled,
  hasLayout,
  onChoose,
  onCancel,
}: {
  disabled: boolean;
  hasLayout: boolean;
  onChoose: (mode: SellingModel) => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation('performances');
  return (
    <section
      className="performance-panel performance-setup-picker"
      aria-labelledby="performance-setup-picker-title"
    >
      <h3 id="performance-setup-picker-title">{t('performances:sellingModelQuestion')}</h3>
      <ul className="performance-setup-choices">
        {sellingModels
          .filter((model) => model !== 'admission' || !hasLayout)
          .map((model) => {
            const { icon: Icon, description } = modelDetails[model];
            return (
              <li key={model}>
                <button
                  type="button"
                  aria-label={t(sellingModelLabels[model])}
                  aria-describedby={`selling-model-${model}-help`}
                  disabled={disabled}
                  onClick={() => onChoose(model)}
                >
                  <Icon size={22} aria-hidden />
                  <span>
                    <strong>{t(sellingModelLabels[model])}</strong>
                    <span id={`selling-model-${model}-help`}>{t(description)}</span>
                  </span>
                  <ArrowRight size={17} aria-hidden />
                </button>
              </li>
            );
          })}
      </ul>
      {onCancel && (
        <button type="button" className="button button-secondary" onClick={onCancel}>
          {t('performances:cancel')}
        </button>
      )}
    </section>
  );
}
