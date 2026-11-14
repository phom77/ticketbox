import { translate } from '../i18n';
import { useTranslation } from 'react-i18next';
import { buyerInformationLinks } from '../features/ticket/buyerInformation';

export function BuyerInformationLinks() {
  useTranslation();
  if (!buyerInformationLinks.length) return null;
  return (
    <nav className="buyer-information-links" aria-label={translate("shared:buyerInformationLinks_hoTroVaDieuKienMuaVe")}>
      {buyerInformationLinks.map(({ label, url }) => (
        <a key={label} href={url} target="_blank" rel="noreferrer">{translate(label)}</a>
      ))}
    </nav>
  );
}
