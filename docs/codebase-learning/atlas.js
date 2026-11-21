const { revision, date, inventory, edges, groups, roadmap, scope } = atlasData;
const services = Object.fromEntries(inventory.map(node => [node.id, node]));
const search = document.querySelector('#search');
const map = document.querySelector('#map');
const inspector = document.querySelector('#inspector');
const status = document.querySelector('#map-status');
let selected = 'ticketing';
let view = 'topology';

document.querySelector('#revision').textContent = `Source review · ${date} · Git ${revision.slice(0, 12)} · Tracked deployment baseline`;

function related(id) {
  return edges.filter(edge => edge.from === id || edge.to === id);
}

function matches(node, query) {
  const searchable = [
    node.name, node.kind, node.capability, node.summary, node.data, node.entry,
    ...related(node.id).flatMap(edge => [edge.summary, edge.transport]),
  ].join(' ').toLowerCase();
  return query.every(term => searchable.includes(term));
}

function nodeButton(id, subtitle) {
  return `<button class="node" type="button" data-node="${id}" aria-pressed="${selected === id}">
    <span class="node-name">${escapeHtml(services[id].name)}</span>
    <small>${escapeHtml(subtitle)}</small>
  </button>`;
}

function edgeCard(edge) {
  return `<article class="edge-card">
    <div class="relation">
      <strong>${escapeHtml(services[edge.from].name)}</strong>
      <span role="img" aria-label="sends a request or message to">${arrow}</span>
      <strong>${escapeHtml(services[edge.to].name)}</strong>
    </div>
    <p class="small muted">${escapeHtml(edge.transport)}</p>
    ${claim(edge)}
  </article>`;
}

function drawDetails() {
  const node = services[selected];
  if (!node) {
    inspector.innerHTML = '<h3>No matching service</h3><p>Try a shorter search or clear the filter.</p>';
    return;
  }
  const connected = related(node.id);
  inspector.innerHTML = `
    <h3>${escapeHtml(node.name)}</h3>
    <p class="small muted">${escapeHtml(node.kind)}</p>
    ${badge(node.status)}
    <p>${escapeHtml(node.summary)}</p>
    <dl class="meta">
      <dt>Business capability or role</dt><dd>${escapeHtml(node.capability)}</dd>
      <dt>Owned or hosted data</dt><dd>${escapeHtml(node.data)}</dd>
      <dt>Entry points</dt><dd><code>${escapeHtml(node.entry)}</code></dd>
    </dl>
    ${node.kind === 'Java service' ? `<p><a href="schema.html#${node.id}">Explore the ${escapeHtml(node.name)} database</a></p>` : ''}
    ${sourceDrawer(node.evidence)}
    <details class="edge-list"${view === 'relationships' ? ' open' : ''}>
      <summary>Incoming and outgoing links (${connected.length})</summary>
      ${connected.length ? connected.map(edgeCard).join('') : '<p>See the source evidence above for this deployment boundary.</p>'}
    </details>`;
}

function drawMap() {
  const query = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visible = new Set(inventory.filter(node => matches(node, query)).map(node => node.id));
  if (!visible.has(selected)) selected = [...visible][0];

  map.innerHTML = groups[view].map(group => {
    const nodes = group.nodes.filter(id => visible.has(id));
    if (!nodes.length) return '';
    const connector = group.connector && !query.length
      ? `<p class="connector small muted"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M10 2v14m-5-5 5 5 5-5"/></svg>${escapeHtml(group.connector)}</p>`
      : '';
    const buttons = nodes.map(id => nodeButton(id, view === 'capabilities' ? services[id].capability : services[id].kind));
    return `${connector}<section class="map-group"><h3>${escapeHtml(group.title)}</h3>
      <div class="map-nodes">${buttons.join('')}</div></section>`;
  }).join('');

  const shown = map.querySelectorAll('[data-node]');
  if (selected && !Array.from(shown).some(button => button.dataset.node === selected)) {
    selected = shown[0]?.dataset.node;
    shown[0]?.setAttribute('aria-pressed', 'true');
  }
  status.textContent = shown.length
    ? `${shown.length} entries · Select a node to inspect ${view === 'relationships' ? 'its traffic.' : 'its role and source.'}`
    : 'No matching entries in this view.';
  drawDetails();
}

document.querySelector('.switch').addEventListener('click', event => {
  const button = event.target.closest('[data-view]');
  if (!button) return;
  view = button.dataset.view;
  document.querySelectorAll('[data-view]').forEach(control => {
    control.setAttribute('aria-pressed', String(control === button));
  });
  drawMap();
});

map.addEventListener('click', event => {
  const button = event.target.closest('[data-node]');
  if (!button) return;
  selected = button.dataset.node;
  map.querySelectorAll('[data-node]').forEach(control => {
    control.setAttribute('aria-pressed', String(control === button));
  });
  drawDetails();
  status.textContent = `Showing details for ${services[selected].name}.`;
});

search.addEventListener('input', drawMap);
document.querySelector('#roadmap').innerHTML = roadmap.map((item, index) => `
  <li><span class="number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><div>
    <h3>${item.lesson ? `<a href="${item.lesson}">${escapeHtml(item.title)}</a>` : escapeHtml(item.title)}</h3>
    ${claim(item)}
  </div></li>`).join('');
document.querySelector('#scope').innerHTML = scope.map(item => claim(item)).join('');
drawMap();
