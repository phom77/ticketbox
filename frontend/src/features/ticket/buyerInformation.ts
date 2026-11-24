import { configuredHttpsUrl } from '../../config/configuredHttpsUrl';

export const buyerInformationLinks = [
  {
    label: 'shared:buyerInformation_hoTroTicketbox',
    url: configuredHttpsUrl(import.meta.env.VITE_SUPPORT_URL),
  },
  {
    label: 'shared:buyerInformation_dieuKienMuaVaHoanVe',
    url: configuredHttpsUrl(import.meta.env.VITE_TERMS_URL),
  },
].flatMap(({ label, url }) => (url ? [{ label, url }] : []));
