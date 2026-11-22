import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

export async function approvePerformanceReview(request, adminToken, submission, { openSale = false } = {}) {
  const review = submission.review;
  assert.equal(review.state, 'SUBMITTED');
  for (const id of [review.id, review.performanceId]) assert.match(id, /^[0-9a-f-]{36}$/i);
  const project = process.env.E2E_PROJECT ?? 'ticketbox-e2e-seating';
  assert.match(project, /^ticketbox-e2e(?:-[a-z0-9-]+)?$/);
  const decision = await request.post('/api/admin/v2/performance-reviews/' + review.performanceId, {
    headers: { Authorization: 'Bearer ' + adminToken },
    data: { revision: review.id, action: 'APPROVE' },
  });
  assert.ok(decision.ok(), await decision.text());

  // Advance the isolated fixture without waiting for a real scheduled sale.
  const sale = openSale ? `
    UPDATE performances SET sale_start_at=now()-interval '1 minute' WHERE id='${review.performanceId}';
    UPDATE performance_sale_offers SET sale_start_at=now()-interval '1 minute' WHERE performance_id='${review.performanceId}';
  ` : '';
  execFileSync('docker', ['compose', '-p', project, '-f', 'compose.yaml', 'exec', '-T', 'catalog-db',
    'psql', '-U', 'catalog_owner', '-d', 'ticketbox_catalog', '-v', 'ON_ERROR_STOP=1', '-c',
    `BEGIN; ${sale} UPDATE performance_publication_reviews SET publish_at=now()-interval '1 second' WHERE id='${review.id}'; COMMIT;`]);
}

export async function submitPerformanceReview(region, request, adminToken, options) {
  const release = region.getByLabel('Public release time (ICT)', { exact: true });
  assert.equal(await release.inputValue(), '');
  const local = new Date(Date.now() + 7 * 3600000 + 10 * 60000).toISOString().slice(0, 16);
  await release.fill(local);
  const response = region.page().waitForResponse((response) =>
    response.url().endsWith('/publication') && response.request().method() === 'POST');
  await region.getByRole('button', { name: 'Submit for review', exact: true }).click();
  const submitted = await response;
  assert.ok(submitted.ok(), await submitted.text());
  await approvePerformanceReview(request, adminToken, (await submitted.json()).data, options);
}
