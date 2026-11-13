import { buyerInformationLinks } from '../features/ticket/buyerInformation';

export function BuyerInformationLinks() {
  if (!buyerInformationLinks.length) return null;
  return (
    <nav className="buyer-information-links" aria-label="Hỗ trợ và điều kiện mua vé">
      {buyerInformationLinks.map(({ label, url }) => (
        <a key={label} href={url} target="_blank" rel="noreferrer">{label}</a>
      ))}
    </nav>
  );
}
