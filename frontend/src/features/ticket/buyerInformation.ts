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
  { label: 'Hỗ trợ TicketBox', url: configuredHttpsUrl(import.meta.env.VITE_SUPPORT_URL) },
  { label: 'Điều kiện mua và hoàn vé', url: configuredHttpsUrl(import.meta.env.VITE_TERMS_URL) },
].flatMap(({ label, url }) => url ? [{ label, url }] : []);
