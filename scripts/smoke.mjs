import assert from 'node:assert/strict';

const base = (process.env.APP_BASE_URL || 'http://localhost:18091').replace(/\/$/, '');
const deadline = Date.now() + 120000;
let ready = false;
while (Date.now() < deadline && !ready) {
  try {
    const response = await fetch(base + '/api/health', { signal: AbortSignal.timeout(3000) });
    ready = response.ok && (await response.json()).status === 'UP';
  } catch { /* Compose starts containers before Spring finishes booting. */ }
  if (!ready) await new Promise(resolve => setTimeout(resolve, 1000));
}
assert(ready, `Core did not become ready: ${base}`);
async function request(path, options = {}) {
  const response = await fetch(base + path, { ...options, signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
  return response;
}

const html = await (await request('/')).text();
for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)) await request(match[1]);
const health = await (await request('/api/health')).json();
assert.equal(health.status, 'UP');
await request('/api/concerts');
for (const role of ['audience', 'organizer', 'staff', 'admin']) {
  const body = await (await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${role}@ticketbox.com`, password: 'password123' }),
  })).json();
  assert.equal(body.data.user.role, role.toUpperCase());
  if (role === 'audience') await request('/api/notifications', {
    headers: { Authorization: `Bearer ${body.data.accessToken}` },
  });
  console.log(`${role}: login OK`);
}
console.log(`Smoke checks passed: ${base}`);
