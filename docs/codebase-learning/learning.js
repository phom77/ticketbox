const statusLabels = {
  'code-confirmed': 'Code-confirmed',
  'docs-only': 'Docs-only',
  inferred: 'Inferred',
  'runtime-observed': 'Runtime-observed',
  unknown: 'Unknown',
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function badge(status) {
  return `<span class="badge" data-status="${status}">${statusLabels[status]}</span>`;
}

function sourceDrawer(sources = [], { open = false, copy = false } = {}) {
  if (!sources.length) return '';
  const links = sources.map(({ path, symbol, start, end, excerpt }) => {
    const location = `${path}:${start}${start === end ? '' : `-${end}`}`;
    const file = new URL(`${document.body.dataset.root}${path}`, document.baseURI);
    const fileHref = `${file.href}#L${start}`;
    const vscode = file.protocol === 'file:' ? `vscode://file${file.pathname}:${start}:1` : '';
    const idea = `jetbrains://idea/navigate/reference?project=ticketbox&path=${encodeURIComponent(`${path}:${start}:1`)}`;
    return `<li>
      <strong>${escapeHtml(symbol)}</strong>
      <a class="source-path" href="${escapeHtml(vscode || fileHref)}"${vscode ? ' title="Open in VS Code"' : ''}><code>${escapeHtml(location)}</code></a>
      <div class="source-actions">
        ${vscode ? `<a href="${escapeHtml(fileHref)}">File</a>` : ''}
        <a href="${escapeHtml(idea)}">IntelliJ IDEA</a>
      </div>
      ${excerpt ? `<pre><code>${escapeHtml(excerpt)}</code></pre>` : ''}
      ${copy ? `<button class="copy" type="button" data-copy="${escapeHtml(location)}">Copy location</button>` : ''}
    </li>`;
  }).join('');
  return `<details class="evidence"${open ? ' open' : ''}>
    <summary>Source evidence (${sources.length})</summary><ul>${links}</ul>
  </details>`;
}

function claim(item, options) {
  return `<div class="claim">${badge(item.status)}
    <p>${escapeHtml(item.summary)}</p>${sourceDrawer(item.evidence, options)}
  </div>`;
}

const arrow = '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 10h13m-5-5 5 5-5 5"/></svg>';

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-copy]');
  if (!button) return;
  try {
    await navigator.clipboard.writeText(button.dataset.copy);
    button.textContent = 'Copied';
  } catch {
    const range = document.createRange();
    range.selectNodeContents(button.parentElement.querySelector('code'));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    button.textContent = 'Selected · copy with Ctrl/Cmd+C';
  }
});
