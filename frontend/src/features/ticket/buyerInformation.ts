import { configuredHttpsUrl } from '../../config/configuredHttpsUrl';

export const supportUrl = configuredHttpsUrl(import.meta.env.VITE_SUPPORT_URL);
/** When configured, buyers must accept these terms before paying. */
export const termsUrl = configuredHttpsUrl(import.meta.env.VITE_TERMS_URL);

export const buyerInformationLinks = [
  { label: 'shared:buyerInformation_hoTroTicketbox', url: supportUrl },
  { label: 'shared:buyerInformation_dieuKienMuaVaHoanVe', url: termsUrl },
].flatMap(({ label, url }) => (url ? [{ label, url }] : []));
