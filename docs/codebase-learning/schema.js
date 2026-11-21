const databaseSelect = document.querySelector('#schema-db');
const tableSelect = document.querySelector('#schema-table');
const viewport = document.querySelector('#erd-viewport');
const extent = document.querySelector('#erd-extent');
const stage = document.querySelector('#erd-stage');
const inspector = document.querySelector('#erd-inspector');
const schemaStatus = document.querySelector('#schema-status');
const zoomOut = document.querySelector('#erd-out');
const zoomIn = document.querySelector('#erd-in');
const { cardWidth, headerHeight, rowHeight } = erdMetrics;

const databases = {
  catalog: ['Catalog', 'concerts'],
  checkin: ['Check-in', 'tickets'],
  identity: ['Identity', 'users'],
  notification: ['Notification', 'notifications'],
  payment: ['Payment', 'payment_attempts'],
  ticketing: ['Ticketing', 'ticket_holds'],
};
const minScale = .2;
const maxScale = 1.6;
let scale = 1;
let links = [];
let pan;

databaseSelect.innerHTML = Object.entries(databases).map(([id, [name]]) =>
  `<option value="${id}">${name}</option>`).join('');
stage.style.setProperty('--erd-header', `${headerHeight}px`);
stage.style.setProperty('--erd-row', `${rowHeight}px`);

function renderTable(service, name, key) {
  const [x, y] = schemaLayout[service].tables[name];
  const primary = key.split(',').map(column => column.trim());
  const foreign = new Set(links.filter(link => !link.codeOnly && link.child === name).map(link => link.column));
  const rows = schemaColumns[service][name].map(([column, type, notNull]) => {
    const pk = primary.includes(column);
    const fk = foreign.has(column);
    const keys = [pk && 'PK', fk && 'FK'].filter(Boolean).join(' ');
    return `<tr data-column="${column}"${keys ? ' data-key' : ''}>
      <td class="erd-key">${keys}</td><td>${column}</td><td>${type}</td>
      <td>${notNull ? '<abbr title="Not null">NN</abbr>' : ''}</td>
    </tr>`;
  }).join('');
  return `<article class="erd-table" data-card="${name}" style="left:${x}px;top:${y}px;width:${cardWidth}px">
    <button type="button" data-table="${name}" aria-pressed="false">${name}</button>
    <table aria-label="${name} columns">
      <colgroup><col class="erd-flags"><col><col class="erd-type"><col class="erd-null"></colgroup>
      <thead class="sr-only"><tr><th scope="col">Key</th><th scope="col">Column</th><th scope="col">Type</th><th scope="col">Nullability</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </article>`;
}

function drawCanvas(service) {
  const { tables, foreignKeys } = schemaData[service];
  const layout = schemaLayout[service];
  links = [
    ...foreignKeys.map(([child, column, parent, target, file, line]) => ({
      child, column, parent, target, codeOnly: false,
      evidence: [migration(service, file, line, line, `${child}.${column} foreign key`)],
    })),
    ...(schemaCodeLinks[service] || []).map(([child, column, parent, target, ...evidence]) => ({
      child, column, parent, target, codeOnly: true, evidence,
    })),
  ];
  stage.style.width = `${layout.width}px`;
  stage.style.height = `${layout.height}px`;
  stage.innerHTML = `
    <svg class="erd-lines" width="${layout.width}" height="${layout.height}" aria-hidden="true">
      <defs><marker id="erd-arrow" viewBox="0 0 9 9" refX="8.5" refY="4.5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0 9 4.5 0 9z" fill="#34677e"/></marker></defs>
      ${links.map((link, i) => `<path class="erd-wire" data-code-only="${link.codeOnly}" d="${layout.paths[i]}" marker-end="url(#erd-arrow)"/>`).join('')}
    </svg>
    ${layout.shelfTop ? `<span class="erd-shelf" style="top:${layout.shelfTop}px">Tables without mapped links</span>` : ''}
    ${tables.map(([name, key]) => renderTable(service, name, key)).join('')}`;
}

function showTable(scrollToTable = false) {
  const service = databaseSelect.value;
  const selected = tableSelect.value;
  const { tables, foreignKeys } = schemaData[service];
  const [, key, file, start, end, keyLine] = tables.find(([name]) => name === selected);
  const active = links.filter(({ child, parent }) => child === selected || parent === selected);

  for (const wire of stage.querySelectorAll('.erd-wire')) {
    wire.removeAttribute('data-highlight');
    wire.toggleAttribute('data-muted', active.length > 0);
  }
  for (const card of stage.querySelectorAll('[data-card]')) {
    const name = card.dataset.card;
    card.toggleAttribute('data-selected', name === selected);
    card.toggleAttribute('data-highlight', active.some(({ child, parent }) => child === name || parent === name));
    card.firstElementChild.setAttribute('aria-pressed', String(name === selected));
    for (const row of card.querySelectorAll('[data-column]')) {
      const column = row.dataset.column;
      row.toggleAttribute('data-linked', active.some(link =>
        (link.child === name && link.column === column) || (link.parent === name && link.target === column)));
    }
  }
  const wires = stage.querySelectorAll('.erd-wire');
  for (const link of active) {
    const wire = wires[links.indexOf(link)];
    wire.setAttribute('data-highlight', '');
    wire.removeAttribute('data-muted');
  }

  schemaStatus.textContent = `${databases[service][0]} · ${tables.length} tables · ${foreignKeys.length} foreign keys`;
  inspector.innerHTML = `
    <h2><code>${selected}</code></h2>
    <p>Primary key <code>${key}</code></p>
    ${sourceDrawer([
      migration(service, file, start, end, 'Table definition'),
      ...(keyLine < start || keyLine > end ? [migration(service, file, keyLine, keyLine, 'Primary key constraint')] : []),
      ...(selected === 'split_cutover_marker' ? [migration(service, 'V7__cutover_startup_fence', 1, 1, 'Adds the ready column')] : []),
    ])}
    <h3 class="subhead">Relationships</h3>
    ${active.length ? `<ul>${active.map(({ child, column, parent, target, codeOnly, evidence }) => `<li>
      <code>${child}.${column}</code> → <code>${parent}.${target}</code>
      <span class="badge">${codeOnly ? 'Code relationship' : 'Foreign key'}</span>
      ${sourceDrawer(evidence)}
    </li>`).join('')}</ul>` : '<p>No mapped relationships.</p>'}`;
  if (scrollToTable) {
    const [x, y] = schemaLayout[service].tables[selected];
    viewport.scrollTo({ left: x * scale - 18, top: y * scale - 18 });
  }
}

function setZoom(value) {
  const { width, height } = schemaLayout[databaseSelect.value];
  const x = (viewport.scrollLeft + viewport.clientWidth / 2) / scale;
  const y = (viewport.scrollTop + viewport.clientHeight / 2) / scale;
  scale = Math.min(maxScale, Math.max(minScale, value));
  extent.style.width = `${Math.ceil(width * scale)}px`;
  extent.style.height = `${Math.ceil(height * scale)}px`;
  stage.style.transform = `scale(${scale})`;
  viewport.scrollTo({ left: x * scale - viewport.clientWidth / 2, top: y * scale - viewport.clientHeight / 2 });
  document.querySelector('#erd-scale').value = `${Math.round(scale * 100)}%`;
  zoomOut.disabled = scale === minScale;
  zoomIn.disabled = scale === maxScale;
}

function fitWidth() {
  return Math.min(1, (viewport.clientWidth - 2) / schemaLayout[databaseSelect.value].width);
}

function selectDatabase(service, table) {
  databaseSelect.value = service;
  tableSelect.innerHTML = schemaData[service].tables.map(([name]) =>
    `<option value="${name}">${name}</option>`).join('');
  const validTable = schemaData[service].tables.some(([name]) => name === table);
  tableSelect.value = validTable ? table : databases[service][1];
  drawCanvas(service);
  setZoom(viewport.clientWidth < 650 ? 1 : Math.max(.7, fitWidth()));
  viewport.scrollTo(0, 0);
  showTable(validTable);
}

databaseSelect.addEventListener('change', () => selectDatabase(databaseSelect.value));
tableSelect.addEventListener('change', () => showTable(true));
zoomOut.addEventListener('click', () => setZoom(scale / 1.2));
zoomIn.addEventListener('click', () => setZoom(scale * 1.2));
document.querySelector('#erd-fit').addEventListener('click', () => {
  setZoom(fitWidth());
  viewport.scrollLeft = 0;
});
stage.addEventListener('click', event => {
  const button = event.target.closest('[data-table]');
  if (!button) return;
  tableSelect.value = button.dataset.table;
  showTable();
});

viewport.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('.erd-table')) return;
  pan = { x: event.clientX + viewport.scrollLeft, y: event.clientY + viewport.scrollTop };
  viewport.setPointerCapture(event.pointerId);
  viewport.setAttribute('data-panning', '');
});
viewport.addEventListener('pointermove', event => {
  if (pan) viewport.scrollTo(pan.x - event.clientX, pan.y - event.clientY);
});
viewport.addEventListener('lostpointercapture', () => {
  pan = undefined;
  viewport.removeAttribute('data-panning');
});

function readSchemaLocation() {
  const [service, table] = location.hash.slice(1).split('/');
  selectDatabase(Object.hasOwn(databases, service) ? service : 'ticketing', table);
}
window.addEventListener('hashchange', readSchemaLocation);
readSchemaLocation();
