const { steps, story, rules, failures, quiz, glossary, impact, openQuestions } = reservationData;
const stepButtons = document.querySelector('#steps');
const timeline = document.querySelector('#timeline');
const previous = document.querySelector('#previous');
const next = document.querySelector('#next');
let current = 0;

stepButtons.innerHTML = steps.map((step, index) => `<li>
  <button type="button" data-step="${index}">
    <span class="number">${index + 1}</span>
    <span><strong>${escapeHtml(step.title)}</strong><small>${escapeHtml(step.participant)}</small></span>
  </button>
</li>`).join('');
timeline.innerHTML = steps.map((step, index) => `
  <li><strong>${index + 1} · ${escapeHtml(step.store)}</strong>${escapeHtml(step.delta)}</li>`).join('');

function selectStep(index) {
  current = index;
  const step = steps[index];
  Array.from(stepButtons.querySelectorAll('button')).forEach((button, position) => {
    if (position === index) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  });
  Array.from(timeline.children).forEach((row, position) => {
    if (position === index) row.setAttribute('aria-current', 'step');
    else row.removeAttribute('aria-current');
  });
  if (stepButtons.scrollWidth > stepButtons.clientWidth) {
    const selected = stepButtons.children[index];
    const offset = selected.getBoundingClientRect().left - stepButtons.getBoundingClientRect().left;
    stepButtons.scrollLeft += offset - (stepButtons.clientWidth - selected.offsetWidth) / 2;
  }
  previous.disabled = index === 0;
  next.disabled = index === steps.length - 1;
  document.querySelector('#step-detail').innerHTML = `
    <p class="transport">Step ${index + 1} of ${steps.length} · ${escapeHtml(step.transport)}</p>
    <h3>${escapeHtml(step.title)}</h3>
    <div class="relation active-edge">
      <span>${escapeHtml(step.from)}</span>
      <span role="img" aria-label="hands off to">${arrow}</span>
      <span>${escapeHtml(step.to)}</span>
    </div>
    ${badge(step.status)} <p>${escapeHtml(step.summary)}</p>
    <dl class="state">
      <div><dt>Input</dt><dd>${escapeHtml(step.input)}</dd></div>
      <div><dt>Output</dt><dd>${escapeHtml(step.output)}</dd></div>
      <div><dt>Illustrative state</dt><dd>${escapeHtml(step.state)}</dd></div>
      <div><dt>Boundary</dt><dd>${escapeHtml(step.boundary)}</dd></div>
    </dl>
    ${sourceDrawer(step.evidence, { open: true, copy: true })}`;
  document.querySelector('#step-status').textContent = `Step ${index + 1} of ${steps.length}. ${step.title}. ${step.delta}`;
}

stepButtons.addEventListener('click', event => {
  const button = event.target.closest('[data-step]');
  if (button) selectStep(Number(button.dataset.step));
});
previous.addEventListener('click', () => {
  selectStep(current - 1);
  if (previous.disabled) stepButtons.querySelector('[aria-current]').focus();
});
next.addEventListener('click', () => {
  selectStep(current + 1);
  if (next.disabled) stepButtons.querySelector('[aria-current]').focus();
});

document.querySelector('#story-evidence').innerHTML = sourceDrawer(story.evidence);
document.querySelector('#rules').innerHTML = rules.map(item => `
  <article class="rule"><h3>${escapeHtml(item.title)}</h3>${claim(item)}</article>`).join('');

const failureControls = document.querySelector('#failure-controls');
failureControls.innerHTML = failures.map((item, index) => `
  <button type="button" data-failure="${index}">${escapeHtml(item.title)}</button>`).join('');

function selectFailure(index) {
  const item = failures[index];
  failureControls.querySelectorAll('button').forEach((button, position) => {
    button.setAttribute('aria-pressed', String(position === index));
  });
  document.querySelector('#failure').innerHTML = `
    <h3>${escapeHtml(item.title)}</h3>
    ${claim(item, { open: true, copy: true })}`;
}

failureControls.addEventListener('click', event => {
  const button = event.target.closest('[data-failure]');
  if (button) selectFailure(Number(button.dataset.failure));
});
document.querySelector('#quiz').innerHTML = quiz.map(item => `
  <details class="quiz"><summary>${escapeHtml(item.title)}</summary>${claim(item)}</details>`).join('');
document.querySelector('#glossary').innerHTML = glossary.map(([term, description]) => `
  <dt>${escapeHtml(term)}</dt><dd>${escapeHtml(description)}</dd>`).join('');
document.querySelector('#impact').innerHTML = `
  <p>${escapeHtml(impact.prompt)}</p>
  <details><summary>Reveal a source-based change map</summary>${claim(impact)}</details>`;
document.querySelector('#open').innerHTML = openQuestions.map(item => claim(item)).join('');

selectStep(0);
selectFailure(0);
