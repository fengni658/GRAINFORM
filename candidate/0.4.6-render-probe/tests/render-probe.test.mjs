// Probe-only logic checks with a DOM/RAF mock. No browser layout/GPU claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { PALETTES, GRAIN_R, WIDTH, HEIGHT } from '../renderer-gpu.mjs';
const html = await readFile(new URL('./render-browser.html', import.meta.url), 'utf8').catch(() => readFile(new URL('../index.html', import.meta.url), 'utf8'));
const script = html.match(/<script type="module">([\s\S]*)<\/script>/)[1].replace(/^import .*;\n/m, '');

async function probe({ width = 342, dpr = 1, viewportWidth = 390 } = {}) {
  const context2d = Object.fromEntries(['setTransform', 'fillRect', 'moveTo', 'lineTo', 'closePath', 'save', 'beginPath', 'rect', 'clip', 'fill', 'restore'].map(name => [name, () => {}]));
  const renderOptions = [], assignments = { gpu: 0, reference: 0 }, dimensions = { width, height: width * 1.5 };
  const nodes = {};
  const gl = { getExtension: () => null, getError: () => 0 };
  for (const id of ['gpu', 'reference']) {
    let w = 300, h = 150;
    nodes[id] = {
      get width() { return w; }, set width(value) { w = value; assignments[id]++; },
      get height() { return h; }, set height(value) { h = value; assignments[id]++; },
      getBoundingClientRect: () => ({ ...dimensions }), getContext: kind => kind === '2d' ? context2d : gl
    };
  }
  for (const id of ['fixture', 'palette', 'report', 'draw', 'run', 'runReference', 'lose', 'restore']) nodes[id] = { value: id === 'fixture' ? 'empty' : id === 'palette' ? 'standard' : '' };
  let time = 0, raf = 0;
  const sandbox = {
    WIDTH, HEIGHT, GRAIN_R, PALETTES, devicePixelRatio: dpr, innerWidth: viewportWidth, innerHeight: 844,
    document: { getElementById: id => nodes[id], documentElement: { dataset: {} } }, window: {}, navigator: { userAgent: 'Node mocked probe; no browser' },
    performance: { now: () => ++time }, fetch: async () => ({ ok: true, json: async () => ({ snapshot: { bodies: [], active: null } }) }),
    requestAnimationFrame: callback => callback(++raf * 1000 / 60),
    createRenderer: canvas => ({ ok: true, diagnostics: {}, render(snapshot, options) {
      renderOptions.push({ ...options });
      const w = Math.max(WIDTH, Math.round(options.cssWidth * Math.min(options.dpr, 3))), h = Math.round(w * HEIGHT / WIDTH);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      return { ok: true, activeGlyphCount: 0, physicalCount: snapshot.bodies.length, cpuSubmissionMs: .1 };
    } })
  };
  await vm.runInNewContext(`(async()=>{${script}})()`, sandbox);
  return { qa: sandbox.window.__RENDER_QA, sandbox, nodes, assignments, renderOptions, dimensions };
}

test('probe CSS keeps 2:3 ratio at a narrowed 390px viewport instead of fixed height', () => {
  assert.match(html, /\.boards figure\{[^}]*max-width:100%[^}]*min-width:0/);
  assert.match(html, /canvas\{[^}]*width:100%[^}]*height:auto[^}]*aspect-ratio:2\/3/);
  assert.doesNotMatch(html, /height:540px|cssWidth:360/);
});

test('GPU and reference receive actual same CSS width and DPR, with backing evidence', async () => {
  for (const dpr of [1, 2, 4]) {
    const { qa, nodes, renderOptions } = await probe({ dpr });
    const evidence = qa.last.sizing, effective = Math.min(dpr, 3);
    assert.equal(evidence.matched, true); assert.equal(evidence.gpu.css.width, 342); assert.equal(evidence.gpu.css.height, 513);
    assert.equal(evidence.reference.css.width, 342); assert.equal(evidence.effectiveDpr, effective);
    assert.equal(nodes.gpu.width, Math.round(342 * effective)); assert.equal(nodes.reference.width, nodes.gpu.width); assert.equal(nodes.reference.height, nodes.gpu.height);
    assert.equal(renderOptions.at(-1).cssWidth, 342); assert.equal(renderOptions.at(-1).dpr, effective);
  }
});

test('stable repeated Canvas2D reference frames do not reset backing dimensions', async () => {
  const { qa, assignments, dimensions, nodes } = await probe();
  const initial = assignments.reference;
  for (let i = 0; i < 10; i++) qa.reference(qa.fixtures.empty, 'standard');
  assert.equal(assignments.reference, initial, 'baseline must not reallocate canvas each frame');
  dimensions.width = 320; dimensions.height = 480; qa.draw();
  assert.equal(assignments.reference, initial + 2); assert.equal(nodes.reference.width, 320); assert.equal(nodes.reference.height, 480);
  qa.draw(); assert.equal(assignments.reference, initial + 2);
});

test('GPU and Canvas2D sampling preserve same viewport/backings and report comparison validity', async () => {
  const { qa, assignments, renderOptions } = await probe({ dpr: 2 });
  const before = assignments.reference;
  const gpu = await qa.runGPU({ frames: 5, fixture: 'empty', palette: 'contrast' });
  const reference = await qa.runReference({ frames: 5, fixture: 'empty', palette: 'contrast' });
  assert.equal(gpu.backend, 'gpu'); assert.equal(reference.backend, 'reference');
  assert.equal(gpu.comparisonValid, true); assert.equal(reference.comparisonValid, true);
  assert.equal(JSON.stringify(gpu.sizingBefore), JSON.stringify(reference.sizingBefore));
  assert.equal(assignments.reference, before, 'baseline sampling does not reset its backing');
  assert.ok(renderOptions.every(options => options.cssWidth === 342 && options.dpr === 2));
  assert.equal(gpu.gpuCompletionMs, null); assert.equal(reference.presentedFPS, null);
});

test('viewport change during measurement invalidates its comparison record', async () => {
  const { qa, sandbox } = await probe(); let frames = 0;
  sandbox.requestAnimationFrame = callback => { if (++frames === 2) sandbox.innerWidth = 400; callback(frames * 1000 / 60); };
  const result = await qa.runReference({ frames: 3, fixture: 'empty' });
  assert.equal(result.viewportStable, false); assert.equal(result.comparisonValid, false);
});
