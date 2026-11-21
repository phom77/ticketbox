// Shared source coordinates. Each data file can also be evaluated without a DOM.
const repoRevision = '81f40e5cf5859da1e9ff9cc410ad9af5afe658f8';
const observedDate = '9 Nov 2026';
const source = (path, start, end, symbol, excerpt) => ({ path, start, end, symbol, excerpt });
const java = (service, file, start, end, symbol, excerpt) => {
  const namespace = { payment: 'com/ticketbox/payments', notification: 'com/ticketbox/notifications' }[service]
    || `org/ticketbox/${service}`;
  return source(`services/${service}/src/main/java/${namespace}/${file}.java`, start, end, symbol, excerpt);
};
const migration = (service, file, start, end, symbol) =>
  source(`services/${service}/src/main/resources/db/migration/${file}.sql`, start, end, symbol);
const confirmed = (id, summary, ...evidence) => ({ id, summary, evidence, status: 'code-confirmed' });
