function configuredHttpsUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export const buyerInformationLinks = [
  { label: 'shared:buyerInformation_hoTroTicketbox', url: configuredHttpsUrl(import.meta.env.VITE_SUPPORT_URL) },
  { label: 'shared:buyerInformation_dieuKienMuaVaHoanVe', url: configuredHttpsUrl(import.meta.env.VITE_TERMS_URL) },
].flatMap(({ label, url }) => url ? [{ label, url }] : []);
