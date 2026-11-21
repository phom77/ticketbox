import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import ts from '../../frontend/node_modules/typescript/lib/typescript.js';

const modulePath = new URL('../../frontend/src/features/performance/layoutSvgImport.ts', import.meta.url);
const source = await readFile(modulePath, 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(outputText + '\n//# sourceURL=layoutSvgImport.ts').toString('base64');
const wrap = (interior, viewBox = '10 20 300 240') => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' +
  viewBox + '">' + interior + '</svg>';
const seated = `
  <g id="stage"><polygon points="30,30 110,30 110,60 30,60"/><text>SÂN KHẤU</text></g>
  <g data-code="C" data-kind="ASSIGNED">
    <title>C · Trung tâm</title>
    <polygon points="40,80 160,80 160,170 40,170"/>
    <g data-row="A">
      <g data-seat="1" data-accessible="true"><circle cx="60" cy="100" r="8"/></g>
      <g data-seat="2" data-restricted-view="true"><circle cx="90" cy="100" r="8"/></g>
    </g>
  </g>`;
const standing = `
  <g id="mixing-desk"><rect x="220" y="140" width="40" height="20"/><text>FOH</text></g>
  <g data-code="FL" data-kind="GA" data-capacity="250">
    <title>FL · Sàn trái · 250 vé</title>
    <polygon points="40,200 160,200 160,240 40,240"/>
  </g>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.route('http://127.0.0.1/**', (route) => route.fulfill({ body: '<!doctype html><title>SVG import test</title>', contentType: 'text/html' }));
  await page.goto('http://127.0.0.1/');
  const run = (source) => page.evaluate(async ({ moduleUrl, source }) => {
    const { readLayoutSvg } = await import(moduleUrl);
    return readLayoutSvg(source);
  }, { moduleUrl, source });
  const layout = await run(wrap(seated + standing + '<foreignObject/><script>throw Error()</script>'));
  assert.ok(layout, 'Import produces an editable layout');
  assert.equal(layout.width, 300);
  assert.equal(layout.height, 240);
  assert.deepEqual(layout.shapes.map(({ kind, label }) => [kind, label]), [['STAGE', 'SÂN KHẤU'], ['LANDMARK', 'FOH']]);
  const [center, floor] = layout.sections;
  assert.deepEqual([center.code, center.label, center.kind], ['C', 'Trung tâm', 'ASSIGNED']);
  assert.deepEqual(center.points[0], { x: 30, y: 60 });
  assert.deepEqual(center.rows[0].seats.map(({ label, x, y, accessible, restrictedView }) =>
    ({ label, x, y, accessible, restrictedView })), [
    { label: '1', x: 50, y: 80, accessible: true, restrictedView: false },
    { label: '2', x: 80, y: 80, accessible: false, restrictedView: true },
  ]);
  assert.deepEqual([floor.code, floor.label, floor.kind, floor.rows.length], ['FL', 'Sàn trái', 'GA', 0]);
  assert.notEqual(center.rows[0].seats[0].id, center.rows[0].seats[1].id);
  assert.deepEqual(Object.keys(layout).sort(), ['height', 'sections', 'shapes', 'width']);

  for (const invalid of [
    '<svg>',
    wrap('<rect width="300" height="240"/>'),
    '<!DOCTYPE svg [<!ENTITY test "bad">]>' + wrap(seated),
    wrap(seated.replace('data-seat="2"', 'data-seat="1"')),
    wrap(seated.replace('cx="60"', 'cx="99999"')),
    wrap(seated.replace('cx="60"', 'cx="190"')),
    wrap(seated.replace('data-row="A"', 'data-row="A" transform="translate(20 20)"')),
  ]) {
    await assert.rejects(run(invalid));
  }
  console.log('Interactive SVG imports editable seats, zones and stage geometry. Invalid SVG is rejected.');
} finally {
  await browser.close();
}
